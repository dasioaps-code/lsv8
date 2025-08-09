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
      console.error('No Stripe signature found');
      return new Response('No signature', { status: 400 });
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
    );

    console.log('Processing webhook event:', event.type, 'ID:', event.id);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout completed:', {
          sessionId: session.id,
          userId: session.metadata?.user_id,
          planType: session.metadata?.plan_type,
          mode: session.mode,
          customerId: session.customer,
          subscriptionId: session.subscription
        });
        
        if (session.metadata?.user_id) {
          await handleSubscriptionUpdate(supabase, session.metadata.user_id, {
            planType: session.metadata.plan_type as any,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            mode: session.mode
          });
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('Payment intent succeeded:', {
          paymentIntentId: paymentIntent.id,
          userId: paymentIntent.metadata?.user_id,
          planType: paymentIntent.metadata?.plan_type,
          amount: paymentIntent.amount,
          customerId: paymentIntent.customer
        });
        
        if (paymentIntent.metadata?.user_id && paymentIntent.metadata?.plan_type) {
          await handleSubscriptionUpdate(supabase, paymentIntent.metadata.user_id, {
            planType: paymentIntent.metadata.plan_type as any,
            stripeCustomerId: paymentIntent.customer as string,
            mode: 'payment'
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('Invoice payment succeeded:', invoice.id);
        
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          
          // Find user by stripe subscription ID
          const { data: existingSubscription } = await supabase
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_subscription_id', subscription.id)
            .single();

          if (existingSubscription) {
            const { error } = await supabase
              .from('subscriptions')
              .update({
                status: 'active',
                current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('stripe_subscription_id', subscription.id);

            if (error) {
              console.error('Error updating subscription period:', error);
            } else {
              console.log('Subscription period updated successfully');
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log('Invoice payment failed:', invoice.id);
        
        if (invoice.subscription) {
          const { error } = await supabase
            .from('subscriptions')
            .update({ 
              status: 'past_due',
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', invoice.subscription as string);

          if (error) {
            console.error('Error updating subscription status to past_due:', error);
          } else {
            console.log('Subscription marked as past_due');
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription cancelled:', subscription.id);
        
        const { error } = await supabase
          .from('subscriptions')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('Error cancelling subscription:', error);
        } else {
          console.log('Subscription cancelled successfully');
        }
        break;
      }

      default:
        console.log('Unhandled webhook event type:', event.type);
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

async function handleSubscriptionUpdate(
  supabase: any,
  userId: string,
  data: {
    planType: 'monthly' | 'semiannual' | 'annual';
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
    mode: string;
  }
) {
  try {
    console.log('Updating subscription for user:', userId, 'Plan:', data.planType, 'Mode:', data.mode);

    // Calculate period end based on plan type
    const now = new Date();
    let periodEnd: Date;
    
    switch (data.planType) {
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

    // Check if subscription already exists
    const { data: existingSubscription, error: fetchError } = await supabase
      .from('subscriptions')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching existing subscription:', fetchError);
      throw fetchError;
    }

    const subscriptionData = {
      user_id: userId,
      plan_type: data.planType,
      status: 'active',
      stripe_customer_id: data.stripeCustomerId,
      stripe_subscription_id: data.stripeSubscriptionId || null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString()
    };

    if (existingSubscription) {
      // Update existing subscription
      const { data: updatedData, error: updateError } = await supabase
        .from('subscriptions')
        .update(subscriptionData)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating subscription:', updateError);
        throw updateError;
      }
      console.log('Subscription updated successfully for user:', userId, 'New data:', updatedData);
    } else {
      // Create new subscription
      const { data: newData, error: insertError } = await supabase
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (insertError) {
        console.error('Error creating subscription:', insertError);
        throw insertError;
      }
      console.log('New subscription created successfully for user:', userId, 'New data:', newData);
    }

  } catch (error) {
    console.error('Error in handleSubscriptionUpdate:', error);
    throw error;
  }
}