import Stripe from "npm:stripe@18.4.0";
import { createClient } from "npm:@supabase/supabase-js@2.53.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, stripe-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const signature = req.headers.get('stripe-signature');
    const body = await req.text();
    
    if (!signature) {
      return new Response('No signature', { status: 400 });
    }

   const event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
);

    console.log('Webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout completed for user:', session.metadata?.user_id);
        
        if (session.metadata?.user_id) {
          const planType = session.metadata.plan_type as 'monthly' | 'semiannual' | 'annual';
          const autoRenew = session.metadata.auto_renew === 'true';
          
          // Calculate period end based on plan
          const now = new Date();
          let periodEnd: Date;
          
          switch (planType) {
            case 'monthly':
              periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              break;
            case 'semiannual':
              periodEnd = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
              break;
            case 'annual':
              periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
              break;
            default:
              periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          }

          // Update or create subscription
          const { error } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: session.metadata.user_id,
              plan_type: planType,
              status: 'active',
              stripe_subscription_id: session.subscription as string,
              stripe_customer_id: session.customer as string,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            }, {
              onConflict: 'user_id'
            });

          if (error) {
            console.error('Error updating subscription:', error);
          } else {
            console.log('Subscription updated successfully');
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment succeeded:', paymentIntent.id);
        
        if (paymentIntent.metadata?.user_id) {
          const planType = paymentIntent.metadata.plan_type as 'monthly' | 'semiannual' | 'annual';
          
          // Calculate period end for one-time payments
          const now = new Date();
          let periodEnd: Date;
          
          switch (planType) {
            case 'semiannual':
              periodEnd = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
              break;
            case 'annual':
              periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
              break;
            default:
              periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          }

          const { error } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: paymentIntent.metadata.user_id,
              plan_type: planType,
              status: 'active',
              stripe_customer_id: paymentIntent.customer as string,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
            }, {
              onConflict: 'user_id'
            });

          if (error) {
            console.error('Error updating subscription for payment:', error);
          } else {
            console.log('Subscription updated for one-time payment');
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          const { error } = await supabase
            .from('subscriptions')
            .update({
              status: 'active',
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id);

          if (error) {
            console.error('Error updating subscription period:', error);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        
        if (invoice.subscription) {
          const { error } = await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', invoice.subscription as string);

          if (error) {
            console.error('Error updating subscription status:', error);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        const { error } = await supabase
          .from('subscriptions')
          .update({ status: 'cancelled' })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error cancelling subscription:', error);
        }
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(`Webhook error: ${error.message}`, { 
      status: 400,
      headers: corsHeaders 
    });
  }
});