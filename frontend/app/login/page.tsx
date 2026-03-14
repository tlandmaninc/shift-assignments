'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { getFirebaseAuth } from '@/lib/firebase';
import { signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ArrowRight, ArrowLeft, Phone, KeyRound } from 'lucide-react';

type Step = 'choose' | 'phone' | 'otp';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const { login, isAuthenticated, isLoading, refreshAuth } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Handle error from callback
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      const errorMessages: Record<string, string> = {
        invalid_state: 'Invalid request. Please try again.',
        not_configured: 'Google OAuth is not configured.',
        invalid_token: 'Authentication failed. Please try again.',
        auth_failed: 'Authentication failed. Please try again.',
      };
      setError(errorMessages[errorParam] || 'An error occurred. Please try again.');
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Focus input on step change
  useEffect(() => {
    if (step === 'phone') {
      setTimeout(() => emailInputRef.current?.focus(), 300);
    } else if (step === 'otp') {
      setTimeout(() => otpInputRef.current?.focus(), 300);
    }
  }, [step]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Initialize reCAPTCHA verifier
  const getRecaptchaVerifier = useCallback(() => {
    const auth = getFirebaseAuth();
    if (!auth) return null;

    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current;
    }

    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      await login();
    } catch {
      setError('Failed to initiate login. Please try again.');
      setIsLoggingIn(false);
    }
  };

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !phoneNumber.trim()) return;
    const auth = getFirebaseAuth();
    if (!auth) {
      setError('Phone authentication is not configured. Check Firebase environment variables.');
      return;
    }

    setError(null);
    setIsSendingCode(true);

    try {
      const verifier = getRecaptchaVerifier();
      if (!verifier) {
        setError('reCAPTCHA initialization failed. Please refresh the page.');
        return;
      }

      // Normalize phone: convert Israeli local to E.164
      let normalized = phoneNumber.replace(/[-\s]/g, '');
      if (normalized.startsWith('0')) {
        normalized = '+972' + normalized.slice(1);
      } else if (!normalized.startsWith('+')) {
        normalized = '+972' + normalized;
      }

      const result = await signInWithPhoneNumber(auth, normalized, verifier);
      setConfirmationResult(result);
      setStep('otp');
      setOtp('');
      setResendCooldown(60);
    } catch (err: any) {
      // Reset reCAPTCHA on error
      recaptchaVerifierRef.current = null;

      const firebaseErrors: Record<string, string> = {
        'auth/invalid-phone-number': 'Invalid phone number format. Please use Israeli format (05X-XXX-XXXX).',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/quota-exceeded': 'SMS quota exceeded. Please try again later.',
      };
      const code = err?.code || '';
      setError(firebaseErrors[code] || err.message || 'Failed to send verification code.');
    } finally {
      setIsSendingCode(false);
    }
  }, [email, phoneNumber, getRecaptchaVerifier]);

  const handleVerifyOtp = useCallback(async () => {
    if (otp.length !== 6 || !confirmationResult) return;
    setError(null);
    setIsVerifying(true);

    try {
      // Confirm the OTP with Firebase
      const credential = await confirmationResult.confirm(otp);
      const idToken = await credential.user.getIdToken();

      // Send to backend for domain validation + JWT issuance
      await authApi.verifyPhoneAuth(email.trim(), phoneNumber.trim(), idToken);
      await refreshAuth();
      router.push('/');
    } catch (err: any) {
      const firebaseErrors: Record<string, string> = {
        'auth/invalid-verification-code': 'Invalid verification code. Please try again.',
        'auth/code-expired': 'Verification code expired. Please request a new one.',
      };
      const code = err?.code || '';
      setError(firebaseErrors[code] || err.message || 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  }, [otp, confirmationResult, email, phoneNumber, refreshAuth, router]);

  const handleResendCode = async () => {
    const auth = getFirebaseAuth();
    if (resendCooldown > 0 || !auth) return;
    setError(null);
    setIsSendingCode(true);

    // Reset reCAPTCHA for resend
    recaptchaVerifierRef.current = null;

    try {
      const verifier = getRecaptchaVerifier();
      if (!verifier) {
        setError('reCAPTCHA initialization failed. Please refresh the page.');
        return;
      }

      let normalized = phoneNumber.replace(/[-\s]/g, '');
      if (normalized.startsWith('0')) {
        normalized = '+972' + normalized.slice(1);
      } else if (!normalized.startsWith('+')) {
        normalized = '+972' + normalized;
      }

      const result = await signInWithPhoneNumber(auth, normalized, verifier);
      setConfirmationResult(result);
      setResendCooldown(60);
      setOtp('');
    } catch (err: any) {
      recaptchaVerifierRef.current = null;
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const goBack = () => {
    setError(null);
    if (step === 'otp') {
      setStep('phone');
      setOtp('');
      setConfirmationResult(null);
    } else if (step === 'phone') {
      setStep('choose');
      setEmail('');
      setPhoneNumber('');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  const slideVariants = {
    enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
  };

  // Track slide direction: 1 = forward, -1 = backward
  const direction = step === 'choose' ? -1 : 1;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      {/* Hero image */}
      <div className="w-full relative overflow-hidden">
        <img
          src="/platform_hero.png"
          alt="Shift Management Platform"
          className="w-full h-auto block"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-100 dark:to-slate-950" />
      </div>

      {/* Login card */}
      <div className="flex-1 flex items-start justify-center px-4 -mt-12 sm:-mt-16 relative z-10 pb-8">
        {/* Hidden reCAPTCHA container */}
        <div id="recaptcha-container" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-md overflow-hidden"
        >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
            <CalendarDays className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Shift Management
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Sign in to manage shift assignments
          </p>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
          >
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          </motion.div>
        )}

        {/* Steps */}
        <AnimatePresence mode="wait" custom={direction}>
          {step === 'choose' && (
            <motion.div
              key="choose"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              {/* Google Login */}
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-3 px-6 py-3
                           bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600
                           rounded-lg shadow-sm hover:shadow-md
                           text-slate-700 dark:text-slate-200 font-medium
                           transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              </div>

              {/* Phone Login */}
              <button
                onClick={() => { setError(null); setStep('phone'); }}
                className="w-full flex items-center justify-center gap-3 px-6 py-3
                           bg-gradient-to-r from-primary-600 to-primary-700
                           hover:from-primary-700 hover:to-primary-800
                           rounded-lg shadow-sm hover:shadow-md
                           text-white font-medium
                           transition-all duration-200"
              >
                <Phone className="w-5 h-5" />
                Sign in with Phone Number
              </button>
            </motion.div>
          )}

          {step === 'phone' && (
            <motion.div
              key="phone"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Clalit Email Address
              </label>
              <input
                ref={emailInputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@clalit.org.il"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                           placeholder-slate-400 dark:placeholder-slate-500
                           focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                           outline-none transition-all"
              />
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Only @clalit.org.il emails are accepted.
              </p>

              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 mt-4">
                Phone Number
              </label>
              <input
                ref={phoneInputRef}
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }}
                placeholder="05X-XXX-XXXX"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                           placeholder-slate-400 dark:placeholder-slate-500
                           focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                           outline-none transition-all"
              />
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                Israeli phone number. An SMS code will be sent.
              </p>

              <button
                onClick={handleSendCode}
                disabled={isSendingCode || !email.trim() || !phoneNumber.trim()}
                className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3
                           bg-gradient-to-r from-primary-600 to-primary-700
                           hover:from-primary-700 hover:to-primary-800
                           rounded-lg shadow-sm hover:shadow-md
                           text-white font-medium
                           transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingCode ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <>
                    Send Code
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          )}

          {step === 'otp' && (
            <motion.div
              key="otp"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="text-center mb-4">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <KeyRound className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Enter the 6-digit code sent to
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{phoneNumber}</p>
              </div>

              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' && otp.length === 6) handleVerifyOtp(); }}
                placeholder="000000"
                className="w-full px-4 py-4 rounded-lg border border-slate-300 dark:border-slate-600
                           bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                           text-center text-2xl font-mono tracking-[0.5em]
                           placeholder-slate-300 dark:placeholder-slate-600
                           focus:ring-2 focus:ring-primary-500 focus:border-primary-500
                           outline-none transition-all"
              />

              <button
                onClick={handleVerifyOtp}
                disabled={isVerifying || otp.length !== 6}
                className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3
                           bg-gradient-to-r from-primary-600 to-primary-700
                           hover:from-primary-700 hover:to-primary-800
                           rounded-lg shadow-sm hover:shadow-md
                           text-white font-medium
                           transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifying ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  'Verify Code'
                )}
              </button>

              <div className="mt-4 text-center">
                {resendCooldown > 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    Resend code in {resendCooldown}s
                  </p>
                ) : (
                  <button
                    onClick={handleResendCode}
                    disabled={isSendingCode}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors disabled:opacity-50"
                  >
                    {isSendingCode ? 'Sending...' : 'Resend Code'}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Psychiatry Department - Shift Management System
        </p>
      </motion.div>
      </div>
    </div>
  );
}
