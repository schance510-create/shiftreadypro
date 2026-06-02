# Shift Ready — Complete Setup Instructions
# shiftready.claritybeforecreation.com

Follow these steps in order. Each one takes about 10 minutes.
If you get stuck at any step, message Claude with a screenshot.

---

## STEP 1 — Set Up Supabase (your database)

1. Go to supabase.com and create a free account
2. Click "New Project"
3. Name it: ShiftReady
4. Choose a database password (save it somewhere safe)
5. Select region: US East (closest to Michigan)
6. Click "Create new project" and wait about 2 minutes

Once your project is ready:
7. Click the SQL Editor icon on the left sidebar (looks like a play button)
8. Click "New query"
9. Open the file called supabase_setup.sql from this folder
10. Copy the entire contents and paste it into the SQL editor
11. Click the green "Run" button
12. You should see "Success. No rows returned"

Now get your keys:
13. Click the gear icon (Settings) in the left sidebar
14. Click "API" in the settings menu
15. You will see two things you need:
    - Project URL (looks like https://xxxxx.supabase.co)
    - service_role key (under Project API keys — click to reveal)
    
WRITE THESE DOWN. You will need them in Step 3.

---

## STEP 2 — Set Up Netlify (your hosting)

1. Go to netlify.com and create a free account
2. From your dashboard, click "Add new site"
3. Choose "Deploy manually"
4. Open your file explorer / Finder
5. Find the shiftready folder that contains all these files
6. Drag the entire shiftready FOLDER onto the Netlify deploy area
7. Wait about 30 seconds for it to deploy
8. Netlify will give you a URL like: https://amazing-name-12345.netlify.app
   That is your temporary address. It works right now.

---

## STEP 3 — Add Your Environment Variables to Netlify

This is where you connect everything together.

1. In Netlify, go to your site dashboard
2. Click "Site configuration" (or "Site settings")
3. Click "Environment variables" in the left menu
4. Click "Add a variable" for each of these:

Variable 1:
  Key:   SUPABASE_URL
  Value: (paste your Supabase Project URL from Step 1)

Variable 2:
  Key:   SUPABASE_SERVICE_KEY
  Value: (paste your Supabase service_role key from Step 1)

Variable 3:
  Key:   STRIPE_SECRET_KEY
  Value: sk_test_51TdpCqEgNFs6IZgGmiaX2QitVsaXGrKc6vjHjXmmR2maGToYX8VT6nHhuCzMcZ6lpG0aKp2OFn6SuuemHN8pHhe000EOnz7RMG

Variable 4:
  Key:   STRIPE_PRICE_ID
  Value: price_1RdpvrEgNFs6IZgGs2VzAjwH

Variable 5:
  Key:   STRIPE_WEBHOOK_SECRET
  Value: (you will add this in Step 4 below — skip for now)

5. After adding all variables, click "Trigger deploy" to redeploy with the new settings

---

## STEP 4 — Set Up Stripe Webhook

This tells Stripe to notify Shift Ready when a subscription changes.

1. Go to dashboard.stripe.com
2. Click "Developers" then "Webhooks"
3. Click "Add endpoint"
4. Endpoint URL: https://YOUR-NETLIFY-URL.netlify.app/api/webhook
   (replace YOUR-NETLIFY-URL with your actual Netlify address from Step 2)
5. Click "Select events" and choose:
   - customer.subscription.updated
   - customer.subscription.deleted
6. Click "Add endpoint"
7. Click on the webhook you just created
8. Click "Reveal" next to "Signing secret"
9. Copy that value (starts with whsec_)
10. Go back to Netlify Environment Variables
11. Update STRIPE_WEBHOOK_SECRET with this value
12. Redeploy again

---

## STEP 5 — Connect Your Subdomain

This makes shiftready.claritybeforecreation.com point to your Netlify app.

1. In Netlify, go to Site configuration > Domain management
2. Click "Add a domain"
3. Type: shiftready.claritybeforecreation.com
4. Netlify will show you a CNAME record to add

Now go to wherever you bought claritybeforecreation.com (GoDaddy, Namecheap, etc.):
5. Find the DNS settings for your domain
6. Add a new CNAME record:
   Name/Host: shiftready
   Value/Points to: (the value Netlify gave you, looks like xxx.netlify.app)
   TTL: 3600 (or default)
7. Save it

DNS changes take 15 minutes to 2 hours to take effect.
Once it works, shiftready.claritybeforecreation.com will load your app.

---

## STEP 6 — Create Your Boston Square Account

1. Go to shiftready.claritybeforecreation.com (or your Netlify URL)
2. Click "Start Free 14-Day Trial"
3. Enter:
   - Business Name: Boston Square Ice Cream Parlor
   - Your email
   - A password you will remember
4. Click Create Account
5. You are in. Add your employees under the Manager tab.

Your Boston Square account is free. You built this.

---

## STEP 7 — Roll Your Stripe Keys (Security)

Since the secret key was shared in a chat conversation, do this now:

1. Go to dashboard.stripe.com > Developers > API Keys
2. Click "Roll key" next to your secret key
3. Copy the new secret key
4. Go to Netlify > Environment Variables
5. Update STRIPE_SECRET_KEY with the new value
6. Redeploy

This takes 5 minutes and protects your account.

---

## AFTER SETUP — Testing Checklist

1. Open the app on your phone and computer at the same time
2. Add a test employee with PIN 9999
3. Clock in on one device
4. Check that the punch shows on the other device (refresh the manager view)
5. Clock out
6. Go to Payroll tab and verify the hours show up
7. Try the Print View and CSV export

If anything is off, message Claude with a screenshot.

---

## QUESTIONS?

Message Claude. Describe what you see, include a screenshot if possible,
and Claude will walk you through it.
