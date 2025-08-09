import { supabase } from '../lib/supabase';

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: 'trial' | 'monthly' | 'semiannual' | 'annual';
  status: 'active' | 'expired' | 'cancelled' | 'past_due';
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  updated_at: string;
}

export interface PlanFeatures {
  maxCustomers: number;
  maxBranches: number;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
  apiAccess: boolean;
}

export class SubscriptionService {
  static async createSubscription(
    userId: string,
    planType: 'trial' | 'monthly' | 'semiannual' | 'annual',
    stripeSubscriptionId?: string,
    stripeCustomerId?: string
  ): Promise<Subscription> {
    try {
      const existingSubscription = await this.getUserSubscription(userId);

      if (existingSubscription && existingSubscription.status === 'active') {
        return await this.updateSubscription(
          existingSubscription.id,
          planType,
          stripeSubscriptionId,
          stripeCustomerId
        );
      }

      const now = new Date();
      const periodStart = now.toISOString();
      let periodEnd: Date;

      switch (planType) {
        case 'trial':
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

      if (existingSubscription) {
        const { data, error } = await supabase
          .from('subscriptions')
          .update({
            plan_type: planType,
            status: 'active',
            stripe_subscription_id: stripeSubscriptionId,
            stripe_customer_id: stripeCustomerId,
            current_period_start: periodStart,
            current_period_end: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSubscription.id)
          .select()
          .single();

        if (error) throw new Error(`Failed to update subscription: ${error.message}`);
        return data;
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_type: planType,
          status: 'active',
          stripe_subscription_id: stripeSubscriptionId,
          stripe_customer_id: stripeCustomerId,
          current_period_start: periodStart,
          current_period_end: periodEnd.toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create subscription: ${error.message}`);
      return data;
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  static async updateSubscription(
    subscriptionId: string,
    planType: 'trial' | 'monthly' | 'semiannual' | 'annual',
    stripeSubscriptionId?: string,
    stripeCustomerId?: string
  ): Promise<Subscription> {
    try {
      const now = new Date();
      let periodEnd: Date;

      switch (planType) {
        case 'trial':
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

      const { data, error } = await supabase
        .from('subscriptions')
        .update({
          plan_type: planType,
          status: 'active',
          stripe_subscription_id: stripeSubscriptionId,
          stripe_customer_id: stripeCustomerId,
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  static async getUserSubscription(userId: string): Promise<Subscription | null> {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error: any) {
      console.error('Error fetching user subscription:', error);
      throw error;
    }
  }

  static async updateSubscriptionStatus(
    subscriptionId: string,
    status: 'active' | 'expired' | 'cancelled' | 'past_due'
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', subscriptionId);

      if (error) throw error;
    } catch (error: any) {
      console.error('Error updating subscription status:', error);
      throw error;
    }
  }

  static async checkSubscriptionAccess(userId: string): Promise<{
    hasAccess: boolean;
    subscription: Subscription | null;
    features: PlanFeatures;
    daysRemaining?: number;
  }> {
    try {
      const subscription = await this.getUserSubscription(userId);
      return this.fallbackAccessCheck(subscription);
    } catch {
      return {
        hasAccess: true,
        subscription: null,
        features: this.getTrialFeatures(),
        daysRemaining: 30,
      };
    }
  }

  private static fallbackAccessCheck(subscription: Subscription | null) {
    if (!subscription) {
      return {
        hasAccess: true,
        subscription: null,
        features: this.getTrialFeatures(),
        daysRemaining: 30,
      };
    }

    const now = new Date();
    const endDate = new Date(subscription.current_period_end);
    const hasAccess = subscription.status === 'active' && endDate > now;
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      hasAccess,
      subscription,
      features: this.getPlanFeatures(subscription.plan_type),
      daysRemaining: Math.max(0, daysRemaining),
    };
  }

  static getPlanFeatures(planType: 'trial' | 'monthly' | 'semiannual' | 'annual'): PlanFeatures {
    switch (planType) {
      case 'trial':
        return this.getTrialFeatures();
      default:
        return {
          maxCustomers: -1,
          maxBranches: -1,
          advancedAnalytics: true,
          prioritySupport: true,
          customBranding: planType !== 'monthly',
          apiAccess: planType !== 'monthly',
        };
    }
  }

  private static getTrialFeatures(): PlanFeatures {
    return {
      maxCustomers: 100,
      maxBranches: 1,
      advancedAnalytics: false,
      prioritySupport: false,
      customBranding: false,
      apiAccess: false,
    };
  }

  static async refreshSubscriptionData(userId: string): Promise<void> {
    await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  static async getPaymentHistory(userId: string): Promise<any[]> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) return [];
      
      return [
        {
          id: subscription.id,
          amount: this.getPlanAmount(subscription.plan_type),
          status: subscription.status === 'active' ? 'paid' : 'failed',
          created: new Date(subscription.created_at).getTime() / 1000,
          period_start: new Date(subscription.current_period_start).getTime() / 1000,
          period_end: new Date(subscription.current_period_end).getTime() / 1000,
          plan_type: subscription.plan_type,
        },
      ];
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }

  private static getPlanAmount(planType: string): number {
    switch (planType) {
      case 'monthly': return 299;
      case 'semiannual': return 999;
      case 'annual': return 1999;
      default: return 0;
    }
  }

  static async getAllSubscriptions() {
    const { data, error } = await supabase
      .from('subscriptions')
      .select(`*, restaurant:restaurants(name, slug)`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getSubscriptionStats() {
    const { data: subscriptions, error } = await supabase
      .from('subscriptions')
      .select('plan_type, status, created_at');

    if (error) throw error;

    const total = subscriptions?.length || 0;
    const active = subscriptions?.filter(s => s.status === 'active').length || 0;
    const trial = subscriptions?.filter(s => s.plan_type === 'trial').length || 0;
    const paid = subscriptions?.filter(s => s.plan_type !== 'trial').length || 0;

    const revenue = subscriptions?.reduce((sum, sub) => {
      if (sub.plan_type === 'monthly') return sum + 2.99;
      if (sub.plan_type === 'semiannual') return sum + 9.99;
      if (sub.plan_type === 'annual') return sum + 19.99;
      return sum;
    }, 0) || 0;

    const cancelled = subscriptions?.filter(s => s.status === 'cancelled').length || 0;
    const churnRate = total > 0 ? (cancelled / total) * 100 : 0;

    return { total, active, trial, paid, revenue, churnRate };
  }
}

// ✅ Export both the class and a lowercase instance
export const subscriptionService = SubscriptionService;
