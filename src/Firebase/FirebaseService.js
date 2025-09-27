// src/firebase/FirebaseService.js
import { auth, db } from './config';
import { signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, serverTimestamp, getDocs, query, orderBy, limit, getDoc } from 'firebase/firestore';

class FirebaseService {
    constructor() {
        this.currentUser = null;
        this.vkUser = null;
        this.isInitialized = false;
        this.authMethod = 'anonymous'; // 'anonymous' or 'vk'
    }

    async initializeAuth(vkUserInfo = null) {
        try {
            // Listen for auth state changes
            onAuthStateChanged(auth, (user) => {
                this.currentUser = user;
                console.log('Auth state changed:', user ? 'Authenticated' : 'Not authenticated');
            });

            // If VK user info is provided, use VK authentication
            if (vkUserInfo && vkUserInfo.id) {
                await this.signInWithVK(vkUserInfo);
            } else {
                // Fallback to anonymous authentication
                await this.signInAnonymously();
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Firebase Auth initialization failed:', error);
            return false;
        }
    }

    async signInWithVK(vkUserInfo) {
        try {
            this.vkUser = vkUserInfo;
            this.authMethod = 'vk';
            this.vkDomain = vkUserInfo.domain || `vk_${vkUserInfo.id}`;

            // Use anonymous auth for Firebase (WebGL limitation)
            const result = await signInAnonymously(auth);
            this.currentUser = result.user;

            // Save VK profile
            await this.saveVKUserProfile(vkUserInfo);

            console.log(`Authenticated with VK user: ${vkUserInfo.first_name} ${vkUserInfo.last_name} (domain: ${this.vkDomain})`);
            return true;
        } catch (error) {
            console.error('VK authentication failed:', error);
            await this.signInAnonymously();
            return false;
        }
    }

    async signInAnonymously() {
        try {
            this.authMethod = 'anonymous';
            const result = await signInAnonymously(auth);
            this.currentUser = result.user;
            console.log('Signed in anonymously via React');
            return true;
        } catch (error) {
            console.error('Anonymous sign-in failed:', error);
            return false;
        }
    }

    async saveVKUserProfile(vkUserInfo) {
        if (!this.currentUser) return;

        try {
            const userProfileData = {
                vkUserId: vkUserInfo.id,
                firstName: vkUserInfo.first_name || '',
                lastName: vkUserInfo.last_name || '',
                photoUrl: vkUserInfo.photo_200 || vkUserInfo.photo_100 || '',
                city: vkUserInfo.city?.title || '',
                country: vkUserInfo.country?.title || '',
                sex: vkUserInfo.sex || 0,
                bdate: vkUserInfo.bdate || '',
                timezone: vkUserInfo.timezone || 0,
                language: vkUserInfo.language || 'ru',
                lastLoginAt: serverTimestamp(),
                platform: 'WebGL-VK',
                authMethod: 'vk'
            };

            // Save to Firestore using Firebase UID but include VK data
            const userDocRef = doc(db, 'players', this.getUserId());
            await setDoc(userDocRef, userProfileData, { merge: true });

            console.log('VK user profile saved to Firestore');
        } catch (error) {
            console.error('Failed to save VK user profile:', error);
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
                platform: "WebGL",
                authMethod: this.authMethod,
                // Add VK user info if available
                ...(this.vkUser && {
                    vkUserId: this.vkUser.id,
                    playerName: `${this.vkUser.first_name} ${this.vkUser.last_name}`.trim()
                })
            };

            // Create document name based on timestamp (same format as Unity)
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const runDocumentName = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

            // Save to Firestore
            const userRunsRef = collection(db, 'players', this.getUserId(), 'runs');
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
            const userRunsRef = collection(db, 'players', this.getUserId(), 'runs');
            const q = query(userRunsRef, orderBy('timestamp', 'desc'), limit(10));
            const querySnapshot = await getDocs(q);

            const runs = [];
            querySnapshot.forEach((doc) => {
                runs.push({ id: doc.id, ...doc.data() });
            });

            // Get user profile data
            const userDocRef = doc(db, 'players', this.getUserId());
            const userDoc = await getDoc(userDocRef);
            const userProfile = userDoc.exists() ? userDoc.data() : {};

            return {
                totalRuns: runs.length,
                recentRuns: runs,
                bestScore: runs.length > 0 ? Math.max(...runs.map(r => r.score)) : 0,
                userProfile: userProfile,
                vkUser: this.vkUser
            };
        } catch (error) {
            console.error('Failed to get player stats:', error);
            return null;
        }
    }

    getUserId() {
        // Use Firebase UID (which is consistent for anonymous users)
        return this.vkDomain || this.getFirebaseUserID() || 'anonymous';

    }
    getFirebaseUserID() {
        // Use VK domain if available, fallback to Firebase UID
        return this.currentUser?.uid || null;

    }
    getVKUserId() {
        // Get the original VK user ID
        return this.vkUser?.id || null;
    }

    getDisplayName() {
        if (this.vkUser) {
            return `${this.vkUser.first_name} ${this.vkUser.last_name}`.trim();
        }
        return 'Anonymous Player';
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    isVKAuthenticated() {
        return this.authMethod === 'vk' && this.vkUser !== null;
    }

    getAuthInfo() {
        return {
            isAuthenticated: this.isAuthenticated(),
            authMethod: this.authMethod,
            userId: this.getUserId(),
            vkUserId: this.getVKUserId(),
            displayName: this.getDisplayName(),
            isVK: this.isVKAuthenticated()
        };
    }
}

// Export singleton instance
const firebaseService = new FirebaseService();
export default firebaseService;