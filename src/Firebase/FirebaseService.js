// src/firebase/FirebaseService.js
import { auth, db } from './config';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';

class FirebaseService {
    constructor() {
        this.currentUser = null;
        this.isInitialized = false;
        this.initializeAuth();
    }

    async initializeAuth() {
        try {
            // Listen for auth state changes
            onAuthStateChanged(auth, (user) => {
                this.currentUser = user;
                console.log('Auth state changed:', user ? 'Authenticated' : 'Not authenticated');
            });

            // Sign in anonymously if not already signed in
            if (!auth.currentUser) {
                await signInAnonymously(auth);
                console.log('Signed in anonymously via React');
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Firebase Auth initialization failed:', error);
            return false;
        }
    }

    async saveRunToFirebase(runData) {
        if (!this.isInitialized || !this.currentUser) {
            console.error('Firebase not initialized or user not authenticated');
            return false;
        }

        try {
            // Convert the Unity run data format to Firestore format
            const firestoreData = {
                score: runData.score || 0,
                playedTime: runData.playedTime || 0,
                artifactSpells: runData.artifactSpells || [],
                playerLevel: runData.playerLevel || 1,
                enemiesKilled: runData.enemiesKilled || 0,
                upgradeLog: runData.upgradeLog || [],
                metaUpgrades: runData.metaUpgrades || {},
                playerChoices: runData.playerChoices || {},
                gameVersion: runData.gameVersion || "web-build",
                timestamp: serverTimestamp(),
                platform: "WebGL"
            };

            // Create document name based on timestamp
            const runDocumentName = new Date().toISOString().replace(/[:.]/g, '-');

            // Save to Firestore
            const userRunsRef = collection(db, 'players', this.currentUser.uid, 'runs');
            const runDocRef = doc(userRunsRef, runDocumentName);

            await setDoc(runDocRef, firestoreData);

            console.log(`Run saved successfully: ${runDocumentName}`, firestoreData);
            return true;
        } catch (error) {
            console.error('Failed to save run to Firebase:', error);
            return false;
        }
    }

    async getPlayerStats() {
        if (!this.isInitialized || !this.currentUser) {
            console.error('Firebase not initialized or user not authenticated');
            return null;
        }

        try {
            const userRunsRef = collection(db, 'players', this.currentUser.uid, 'runs');
            const q = query(userRunsRef, orderBy('timestamp', 'desc'), limit(10));
            const querySnapshot = await getDocs(q);

            const runs = [];
            querySnapshot.forEach((doc) => {
                runs.push({ id: doc.id, ...doc.data() });
            });

            return {
                totalRuns: runs.length,
                recentRuns: runs,
                bestScore: runs.length > 0 ? Math.max(...runs.map(r => r.score)) : 0
            };
        } catch (error) {
            console.error('Failed to get player stats:', error);
            return null;
        }
    }

    getUserId() {
        return this.currentUser?.uid || null;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }
}

// Export singleton instance
const firebaseService = new FirebaseService();
export default firebaseService;