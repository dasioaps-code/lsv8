import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CreditCard, Calendar, AlertCircle, CheckCircle, RefreshCw, 
  Crown, Clock, DollarSign, User, Settings, ExternalLink,
  Download, FileText, Shield, Zap
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionService } from '../services/subscriptionService';

export default function BillingPage() {
  const { user, subscriptionData, refreshSubscription } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubscription = async () => {
    if (!user) return;
    
    try {
      setError(null);
      
      // Get subscription data from auth context first
      if (subscriptionData) {
        setSubscription(subscriptionData.subscription);
      }
      
      // Also fetch fresh data from service
      const freshData = await SubscriptionService.checkSubscriptionAccess(user.id);
      setSubscription(freshData.subscription);
      
      // Get payment history
      const history = await SubscriptionService.getPaymentHistory(user.id);
      setPaymentHistory(history);
      
    } catch (err) {
      console.error('Error loading subscription:', err);
      setError('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Refresh subscription data in auth context
    await refreshSubscription();
    await loadSubscription();
    setRefreshing(false);
  };

  useEffect(() => {
    loadSubscription();
  }, [user, subscriptionData]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getPlanDisplayName = (planType: string) => {
    switch (planType) {
      case 'trial': return 'Free Trial';
      case 'monthly': return 'Monthly Plan';
      case 'semiannual': return 'Semi-Annual Plan';
      case 'annual': return 'Annual Plan';
      default: return planType;
    }
  };

  const getPlanPrice = (planType: string) => {
    switch (planType) {
      case 'trial': return '$0';
      case 'monthly': return '$2.99';
      case 'semiannual': return '$9.99';
      case 'annual': return '$19.99';
      default: return 'N/A';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'expired': return 'text-red-600 bg-red-100';
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      case 'past_due': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getDaysRemaining = () => {
    if (!subscription?.current_period_end) return 0;
    const endDate = new Date(subscription.current_period_end);
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-gray-200 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-gray-600 mt-1">Manage your subscription and billing information</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#E6A85C] via-[#E85A9B] to-[#D946EF] text-white rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Current Subscription */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <CreditCard className="w-5 h-5" />
            Current Subscription
          </h2>
        </div>
        <div className="p-6">
          {subscription ? (
            <div className="space-y-6">
              {/* Plan Header */}
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-12 h-12 bg-gradient-to-r from-[#E6A85C] via-[#E85A9B] to-[#D946EF] rounded-xl flex items-center justify-center">
                      <Crown className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900">
                        {getPlanDisplayName(subscription.plan_type)}
                      </h3>
                      <p className="text-blue-600 font-medium">{getPlanPrice(subscription.plan_type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
                      {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                    </span>
                    {subscription.plan_type === 'trial' && (
                      <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                        {getDaysRemaining()} days remaining
                      </span>
                    )}
                  </div>
                </div>
                {subscription.plan_type === 'trial' && (
                  <button
                    onClick={() => navigate('/upgrade')}
                    className="px-6 py-3 bg-gradient-to-r from-[#E6A85C] via-[#E85A9B] to-[#D946EF] text-white rounded-xl hover:shadow-lg transition-all duration-200 font-medium"
                  >
                    Upgrade Now
                  </button>
                )}
              </div>

              {/* Subscription Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Calendar className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Billing Period</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Started:</span>
                      <span className="font-medium text-gray-900">
                        {formatDate(subscription.current_period_start)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Expires:</span>
                      <span className="font-medium text-gray-900">
                        {formatDate(subscription.current_period_end)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Shield className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Account Details</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Plan:</span>
                      <span className="font-medium text-gray-900">
                        {getPlanDisplayName(subscription.plan_type)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                        {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                      </span>
                    </div>
                    {subscription.stripe_subscription_id && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Subscription ID:</span>
                        <span className="font-mono text-xs text-gray-900">
                          {subscription.stripe_subscription_id.substring(0, 12)}...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Trial Warning */}
              {subscription.plan_type === 'trial' && getDaysRemaining() <= 7 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                      <Clock className="h-6 w-6 text-yellow-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-yellow-900 mb-2">Trial Ending Soon</h3>
                      <p className="text-yellow-800 mb-4">
                        Your trial expires in {getDaysRemaining()} days. Upgrade now to continue using all features.
                      </p>
                      <button
                        onClick={() => navigate('/upgrade')}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                      >
                        Upgrade Now
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Subscription Found</h3>
              <p className="text-gray-600 mb-6">You don't have an active subscription yet.</p>
              <button
                onClick={() => navigate('/upgrade')}
                className="px-6 py-3 bg-gradient-to-r from-[#E6A85C] via-[#E85A9B] to-[#D946EF] text-white rounded-xl hover:shadow-lg transition-all duration-200"
              >
                Choose a Plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment History */}
      {paymentHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-5 h-5" />
              Payment History
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {paymentHistory.map((payment, index) => (
              <div key={payment.id || index} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {getPlanDisplayName(payment.plan_type)} - {payment.status === 'paid' ? 'Paid' : 'Failed'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatTimestamp(payment.created)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      ${(payment.amount / 100).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatTimestamp(payment.period_start)} - {formatTimestamp(payment.period_end)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing Actions */}
      {subscription && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="w-5 h-5" />
              Billing Actions
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => navigate('/upgrade')}
                className="p-4 border border-gray-200 rounded-xl hover:border-[#E6A85C] hover:bg-gradient-to-r hover:from-[#E6A85C]/5 hover:via-[#E85A9B]/5 hover:to-[#D946EF]/5 transition-all duration-200 text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-[#E6A85C] group-hover:text-white transition-all duration-200">
                    <Crown className="h-5 w-5 text-blue-600 group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 group-hover:text-[#E6A85C] transition-colors">
                      {subscription.plan_type === 'trial' ? 'Upgrade Plan' : 'Change Plan'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {subscription.plan_type === 'trial' ? 'Unlock all features' : 'Switch to a different plan'}
                    </p>
                  </div>
                </div>
              </button>

              <div className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-700">Payment Methods</h3>
                    <p className="text-sm text-gray-500">Manage payment information</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Coming Soon</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Information */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Debug Information</h3>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium text-gray-700">User ID:</span>
                <p className="font-mono text-xs text-gray-600">{user?.id}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Subscription Data:</span>
                <p className="text-gray-600">{subscriptionData ? 'Available' : 'Not loaded'}</p>
              </div>
            </div>
            {subscription && (
              <div className="mt-4 p-3 bg-white rounded-lg border">
                <pre className="text-xs text-gray-600 overflow-auto">
                  {JSON.stringify(subscription, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}