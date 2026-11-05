import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

const DEFAULT_UNIVILLAGE_ADMIN = {
  uid: 'univillage-admin-id',
  email: 'admin@univillage.com',
  name: 'Univillage Finance Admin',
  role: 'admin',
  approvalStatus: 'approved',
  isActive: true,
};

const DEFAULT_UNIVILLAGE_EMPLOYEE = {
  uid: 'univillage-employee-id',
  email: 'employee@univillage.com',
  name: 'Aarav Patel',
  role: 'employee',
  approvalStatus: 'approved',
  isActive: true,
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sync state from localStorage for mock/offline persistence
  useEffect(() => {
    const saved = localStorage.getItem('univillage_auth_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCurrentUser(parsed);
        setUserProfile(parsed);
      } catch {
        localStorage.removeItem('univillage_auth_user');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const profile = {
              uid: fbUser.uid,
              email: fbUser.email,
              name: data.name || fbUser.displayName || 'User',
              role: data.role || 'employee',
              approvalStatus: data.approvalStatus || 'pending',
              isActive: data.isActive !== false,
            };
            setCurrentUser(fbUser);
            setUserProfile(profile);
            localStorage.setItem('univillage_auth_user', JSON.stringify(profile));
          }
        } catch {
          // If offline or unconfigured
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    // 1. Try Firebase Auth
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      let profile = null;
      if (userDoc.exists()) {
        const data = userDoc.data();
        profile = {
          uid: cred.user.uid,
          email: cred.user.email,
          name: data.name || cred.user.displayName || 'User',
          role: data.role || 'employee',
          approvalStatus: data.approvalStatus || 'pending',
          isActive: data.isActive !== false,
        };
      } else {
        profile = {
          uid: cred.user.uid,
          email: cred.user.email,
          name: cred.user.displayName || 'User',
          role: 'employee',
          approvalStatus: 'pending',
          isActive: true,
        };
      }
      setCurrentUser(cred.user);
      setUserProfile(profile);
      localStorage.setItem('univillage_auth_user', JSON.stringify(profile));
      return profile;
    } catch {
      // 2. Fallback to pre-seeded Univillage credentials for zero-config testing
      const normEmail = email.trim().toLowerCase();
      if (normEmail === 'admin@univillage.com' && password === 'Password123!') {
        setCurrentUser(DEFAULT_UNIVILLAGE_ADMIN);
        setUserProfile(DEFAULT_UNIVILLAGE_ADMIN);
        localStorage.setItem('univillage_auth_user', JSON.stringify(DEFAULT_UNIVILLAGE_ADMIN));
        return DEFAULT_UNIVILLAGE_ADMIN;
      }
      if (normEmail === 'employee@univillage.com' && password === 'Password123!') {
        setCurrentUser(DEFAULT_UNIVILLAGE_EMPLOYEE);
        setUserProfile(DEFAULT_UNIVILLAGE_EMPLOYEE);
        localStorage.setItem('univillage_auth_user', JSON.stringify(DEFAULT_UNIVILLAGE_EMPLOYEE));
        return DEFAULT_UNIVILLAGE_EMPLOYEE;
      }

      // 3. Fallback to mock registered users in localStorage
      const registered = JSON.parse(localStorage.getItem('univillage_registered_users') || '[]');
      const found = registered.find((u) => u.email.toLowerCase() === normEmail && u.password === password);
      if (found) {
        const profile = {
          uid: found.uid,
          email: found.email,
          name: found.name,
          role: found.role,
          approvalStatus: found.approvalStatus,
          isActive: found.isActive,
        };
        setCurrentUser(profile);
        setUserProfile(profile);
        localStorage.setItem('univillage_auth_user', JSON.stringify(profile));
        return profile;
      }

      throw new Error('Invalid email or password. Use admin@univillage.com or employee@univillage.com with Password123!');
    }
  };

  const signup = async (email, password, name, phone) => {
    const normEmail = email.trim().toLowerCase();
    let uid = 'uvl-emp-' + Date.now();

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      uid = cred.user.uid;
      const profile = {
        name,
        email: normEmail,
        phone,
        role: 'employee',
        approvalStatus: 'pending',
        isActive: true,
        created_at: new Date().toISOString(),
      };
      await setDoc(doc(db, 'users', uid), profile);
      const fullProfile = { uid, ...profile };
      setCurrentUser(cred.user);
      setUserProfile(fullProfile);
      localStorage.setItem('univillage_auth_user', JSON.stringify(fullProfile));
      return fullProfile;
    } catch {
      // Mock signup fallback
      const profile = {
        uid,
        name,
        email: normEmail,
        phone,
        password,
        role: 'employee',
        approvalStatus: 'pending',
        isActive: true,
        created_at: new Date().toISOString(),
      };
      const registered = JSON.parse(localStorage.getItem('univillage_registered_users') || '[]');
      registered.push(profile);
      localStorage.setItem('univillage_registered_users', JSON.stringify(registered));

      const sessionProfile = { ...profile };
      delete sessionProfile.password;
      setCurrentUser(sessionProfile);
      setUserProfile(sessionProfile);
      localStorage.setItem('univillage_auth_user', JSON.stringify(sessionProfile));
      return sessionProfile;
    }
  };

  const logout = async () => {
    try {
      await fbSignOut(auth);
    } catch {
      // Ignore
    }
    setCurrentUser(null);
    setUserProfile(null);
    localStorage.removeItem('univillage_auth_user');
  };

  const value = {
    currentUser,
    userProfile,
    loading,
    login,
    signup,
    logout,
    isAdmin: userProfile?.role === 'admin',
    isEmployee: userProfile?.role === 'employee',
    isApproved: userProfile?.approvalStatus === 'approved',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
