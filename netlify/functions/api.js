// ================================================
// SHIFT READY - Backend API
// Netlify Serverless Function
// Handles all database and Stripe operations
// ================================================

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const crypto = require('crypto');

// These environment variables are set in Netlify dashboard
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Simple password hashing (SHA-256)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'shiftready_salt').digest('hex');
}

// CORS headers for all responses
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

// ================================================
// MAIN HANDLER
// Routes requests to the right function
// ================================================
exports.handler = async (event) => {
  // Handle preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path   = event.path.replace('/.netlify/functions/api', '').replace('/api', '');
  const method = event.httpMethod;
  let body = {};

  try {
    if (event.body) body = JSON.parse(event.body);
  } catch(e) {}

  try {
    // ---- AUTH ROUTES ----

    // POST /signup — create a new business account
    if (path === '/signup' && method === 'POST') {
      const { businessName, email, password } = body;
      if (!businessName || !email || !password) {
        return respond(400, { error: 'Business name, email and password are required.' });
      }

      // Check if email already exists
      const { data: existing } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_email', email.toLowerCase())
        .single();

      if (existing) return respond(400, { error: 'An account with that email already exists.' });

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: email.toLowerCase(),
        name: businessName,
        metadata: { businessName }
      });

      // Create Stripe trial subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: process.env.STRIPE_PRICE_ID }],
        trial_period_days: 14,
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent']
      });

      // Save business to database
      const { data: business, error } = await supabase
        .from('businesses')
        .insert({
          name: businessName,
          owner_email: email.toLowerCase(),
          owner_password_hash: hashPassword(password),
          manager_password: 'manager123',
          stripe_customer_id: customer.id,
          stripe_subscription_id: subscription.id,
          subscription_status: 'trialing'
        })
        .select()
        .single();

      if (error) return respond(500, { error: 'Could not create account. Please try again.' });

      // Add a sample employee so they can test right away
      await supabase.from('employees').insert({
        business_id: business.id,
        name: 'Sample Employee',
        pin: '1234',
        hourly_rate: 13.00
      });

      return respond(200, {
        success: true,
        businessId: business.id,
        businessName: business.name,
        trialEndsAt: business.trial_ends_at,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret || null
      });
    }

    // POST /login — owner logs in
    if (path === '/login' && method === 'POST') {
      const { email, password } = body;
      if (!email || !password) return respond(400, { error: 'Email and password required.' });

      const { data: business } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_email', email.toLowerCase())
        .single();

      if (!business) return respond(401, { error: 'No account found with that email.' });
      if (business.owner_password_hash !== hashPassword(password)) {
        return respond(401, { error: 'Incorrect password.' });
      }

      // Check subscription status
      let subStatus = business.subscription_status;
      if (business.stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(business.stripe_subscription_id);
          subStatus = sub.status;
          await supabase.from('businesses').update({ subscription_status: subStatus }).eq('id', business.id);
        } catch(e) {}
      }

      return respond(200, {
        success: true,
        businessId: business.id,
        businessName: business.name,
        managerPassword: business.manager_password,
        subscriptionStatus: subStatus,
        trialEndsAt: business.trial_ends_at
      });
    }

    // POST /manager-login — manager PIN login inside the app
    if (path === '/manager-login' && method === 'POST') {
      const { businessId, password } = body;
      const { data: business } = await supabase
        .from('businesses')
        .select('manager_password, name, subscription_status, trial_ends_at')
        .eq('id', businessId)
        .single();

      if (!business) return respond(404, { error: 'Business not found.' });
      if (business.manager_password !== password) return respond(401, { error: 'Incorrect manager password.' });

      return respond(200, {
        success: true,
        businessName: business.name,
        subscriptionStatus: business.subscription_status,
        trialEndsAt: business.trial_ends_at
      });
    }

    // ---- EMPLOYEE ROUTES ----

    // GET /employees?businessId=xxx
    if (path === '/employees' && method === 'GET') {
      const businessId = event.queryStringParameters?.businessId;
      if (!businessId) return respond(400, { error: 'businessId required.' });
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('business_id', businessId)
        .eq('active', true)
        .order('name');
      if (error) return respond(500, { error: error.message });
      return respond(200, { employees: data });
    }

    // POST /employees — add employee
    if (path === '/employees' && method === 'POST') {
      const { businessId, name, pin, hourlyRate } = body;
      if (!businessId || !name || !pin) return respond(400, { error: 'Missing required fields.' });

      const { data, error } = await supabase
        .from('employees')
        .insert({ business_id: businessId, name, pin, hourly_rate: hourlyRate || 0 })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') return respond(400, { error: 'That PIN is already in use.' });
        return respond(500, { error: error.message });
      }
      return respond(200, { employee: data });
    }

    // PUT /employees — edit employee
    if (path === '/employees' && method === 'PUT') {
      const { employeeId, businessId, name, pin, hourlyRate } = body;
      const { data, error } = await supabase
        .from('employees')
        .update({ name, pin, hourly_rate: hourlyRate })
        .eq('id', employeeId)
        .eq('business_id', businessId)
        .select()
        .single();
      if (error) {
        if (error.code === '23505') return respond(400, { error: 'That PIN is already in use.' });
        return respond(500, { error: error.message });
      }
      return respond(200, { employee: data });
    }

    // DELETE /employees — remove employee
    if (path === '/employees' && method === 'DELETE') {
      const { employeeId, businessId } = body;
      await supabase.from('employees')
        .update({ active: false })
        .eq('id', employeeId)
        .eq('business_id', businessId);
      return respond(200, { success: true });
    }

    // ---- TIME ENTRY ROUTES ----

    // GET /entries?businessId=xxx&date=xxx or &weekStart=xxx&weekEnd=xxx
    if (path === '/entries' && method === 'GET') {
      const { businessId, date, weekStart, weekEnd } = event.queryStringParameters || {};
      if (!businessId) return respond(400, { error: 'businessId required.' });

      let query = supabase.from('time_entries').select('*').eq('business_id', businessId);
      if (date)      query = query.eq('date', date);
      if (weekStart) query = query.gte('date', weekStart);
      if (weekEnd)   query = query.lte('date', weekEnd);

      const { data, error } = await query.order('clock_in', { ascending: true });
      if (error) return respond(500, { error: error.message });
      return respond(200, { entries: data });
    }

    // POST /entries — clock action (in/break-start/break-end/out)
    if (path === '/entries' && method === 'POST') {
      const { businessId, employeeId, employeeName, action, date } = body;

      // Get today's open entry for this employee
      const { data: openEntries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('business_id', businessId)
        .eq('employee_id', employeeId)
        .eq('date', date)
        .is('clock_out', null);

      const openEntry = openEntries && openEntries.length > 0 ? openEntries[0] : null;
      const now = Date.now();

      if (action === 'clock-in') {
        if (openEntry) return respond(400, { error: 'Already clocked in.' });
        const { data, error } = await supabase
          .from('time_entries')
          .insert({
            business_id: businessId,
            employee_id: employeeId,
            employee_name: employeeName,
            date: date,
            clock_in: now,
            total_break_minutes: 0
          })
          .select()
          .single();
        if (error) return respond(500, { error: error.message });
        return respond(200, { entry: data });
      }

      if (action === 'break-start') {
        if (!openEntry) return respond(400, { error: 'Not clocked in.' });
        if (openEntry.break_start && !openEntry.break_end) return respond(400, { error: 'Already on break.' });
        const { data, error } = await supabase
          .from('time_entries')
          .update({ break_start: now, break_end: null })
          .eq('id', openEntry.id)
          .select()
          .single();
        if (error) return respond(500, { error: error.message });
        return respond(200, { entry: data });
      }

      if (action === 'break-end') {
        if (!openEntry || !openEntry.break_start) return respond(400, { error: 'No break to end.' });
        const breakMins = Math.round((now - openEntry.break_start) / 60000);
        const totalBreak = (openEntry.total_break_minutes || 0) + breakMins;
        const { data, error } = await supabase
          .from('time_entries')
          .update({ break_end: now, total_break_minutes: totalBreak })
          .eq('id', openEntry.id)
          .select()
          .single();
        if (error) return respond(500, { error: error.message });
        return respond(200, { entry: data });
      }

      if (action === 'clock-out') {
        if (!openEntry) return respond(400, { error: 'Not clocked in.' });
        let updates = { clock_out: now };
        if (openEntry.break_start && !openEntry.break_end) {
          const breakMins = Math.round((now - openEntry.break_start) / 60000);
          updates.break_end = now;
          updates.total_break_minutes = (openEntry.total_break_minutes || 0) + breakMins;
        }
        const { data, error } = await supabase
          .from('time_entries')
          .update(updates)
          .eq('id', openEntry.id)
          .select()
          .single();
        if (error) return respond(500, { error: error.message });
        return respond(200, { entry: data });
      }

      return respond(400, { error: 'Invalid action.' });
    }

    // PUT /entries — manager edits an entry
    if (path === '/entries' && method === 'PUT') {
      const { entryId, businessId, date, clockIn, clockOut, breakStart, breakEnd, totalBreakMinutes, managerNote } = body;
      const { data, error } = await supabase
        .from('time_entries')
        .update({
          date, clock_in: clockIn, clock_out: clockOut,
          break_start: breakStart, break_end: breakEnd,
          total_break_minutes: totalBreakMinutes,
          edited: true, manager_note: managerNote
        })
        .eq('id', entryId)
        .eq('business_id', businessId)
        .select()
        .single();
      if (error) return respond(500, { error: error.message });
      return respond(200, { entry: data });
    }

    // POST /entries/add — manager adds a missing entry
    if (path === '/entries/add' && method === 'POST') {
      const { businessId, employeeId, employeeName, date, clockIn, clockOut, breakStart, breakEnd, totalBreakMinutes, managerNote } = body;
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          business_id: businessId,
          employee_id: employeeId,
          employee_name: employeeName,
          date, clock_in: clockIn, clock_out: clockOut,
          break_start: breakStart, break_end: breakEnd,
          total_break_minutes: totalBreakMinutes || 0,
          edited: true,
          manager_note: 'MANAGER ADDED: ' + managerNote
        })
        .select()
        .single();
      if (error) return respond(500, { error: error.message });
      return respond(200, { entry: data });
    }

    // ---- SETTINGS ROUTES ----

    // PUT /settings — update manager password or business name
    if (path === '/settings' && method === 'PUT') {
      const { businessId, managerPassword, businessName } = body;
      const updates = {};
      if (managerPassword) updates.manager_password = managerPassword;
      if (businessName)    updates.name = businessName;
      const { error } = await supabase.from('businesses').update(updates).eq('id', businessId);
      if (error) return respond(500, { error: error.message });
      return respond(200, { success: true });
    }

    // ---- STRIPE WEBHOOK ----
    if (path === '/webhook' && method === 'POST') {
      const sig = event.headers['stripe-signature'];
      let stripeEvent;
      try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch(e) {
        return respond(400, { error: 'Webhook signature failed.' });
      }

      const sub = stripeEvent.data.object;
      if (['customer.subscription.updated', 'customer.subscription.deleted'].includes(stripeEvent.type)) {
        await supabase.from('businesses')
          .update({ subscription_status: sub.status })
          .eq('stripe_subscription_id', sub.id);
      }
      return respond(200, { received: true });
    }

    return respond(404, { error: 'Route not found.' });

  } catch(err) {
    console.error('API Error:', err);
    return respond(500, { error: 'Server error. Please try again.' });
  }
};
