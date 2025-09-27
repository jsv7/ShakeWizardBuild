// src/firebase/FirebaseService.js
import { auth, db } from './config';
import { signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, collection, serverTimestamp, getDocs, query, orderBy, limit, getDoc, updateDoc } from 'firebase/firestore';

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
            console.log('Signed in anonymously');
            return true;
        } catch (error) {
            console.error('Anonymous authentication failed:', error);
            return false;
        }
    }

    async saveVKUserProfile(vkUserInfo) {
        try {
            const userDocRef = doc(db, 'players', this.getUserId());

            const profileData = {
                vkId: vkUserInfo.id,
                firstName: vkUserInfo.first_name,
                lastName: vkUserInfo.last_name,
                domain: vkUserInfo.domain,
                photoUrl: vkUserInfo.photo_200,
                lastLogin: serverTimestamp(),
                authMethod: 'vk'
            };

            await setDoc(userDocRef, { profile: profileData }, { merge: true });
            console.log('VK user profile saved');
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
            // Create Firestore-compatible data
            const firestoreData = {
                score: runData.score,
                playedTime: runData.playedTime,
                artifactSpells: runData.artifactSpells || [],
                playerLevel: runData.playerLevel || 1,
                enemiesKilled: runData.enemiesKilled || 0,
                upgradeLog: runData.upgradeLog || [],
                timestamp: serverTimestamp(),
                gameVersion: runData.gameVersion || 'unknown',
                platform: 'WebGL'
            };

            // Create timestamped document name
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

    // NEW: Save SOAP stats data (money + metaUpgrades) to Firebase stats field
    async savePlayerStats(statsData) {
        if (!this.isInitialized || !this.currentUser) {
            console.error('Firebase not initialized or user not authenticated');
            return false;
        }

        try {
            console.log('Saving player stats:', statsData);

            // Create the stats data structure with List<MetaUpgradeData>
            const firestoreStatsData = {
                money: statsData.money || 0,
                metaUpgrades: statsData.metaUpgrades || [],
                lastUpdated: serverTimestamp(),
                platform: 'WebGL'
            };

            console.log('Prepared Firestore data:', firestoreStatsData);
            console.log('Meta upgrades count:', firestoreStatsData.metaUpgrades.length);

            // Save to the stats field in the user's document (not a separate collection)
            const userDocRef = doc(db, 'players', this.getUserId());

            await updateDoc(userDocRef, {
                stats: firestoreStatsData
            });

            console.log('Player stats saved successfully:', firestoreStatsData);
            return true;
        } catch (error) {
            // If document doesn't exist, create it
            if (error.code === 'not-found') {
                try {
                    const firestoreStatsData = {
                        money: statsData.money || 0,
                        metaUpgrades: statsData.metaUpgrades || [],
                        lastUpdated: serverTimestamp(),
                        platform: 'WebGL'
                    };

                    const userDocRef = doc(db, 'players', this.getUserId());
                    await setDoc(userDocRef, {
                        stats: firestoreStatsData
                    }, { merge: true });

                    console.log('Player stats document created and saved:', firestoreStatsData);
                    return true;
                } catch (createError) {
                    console.error('Failed to create player stats document:', createError);
                    return false;
                }
            }

            console.error('Failed to save player stats:', error);
            return false;
        }
    }

    async getPlayerStats() {
        if (!this.isInitialized || !this.currentUser) {
            console.error('Firebase not initialized or user not authenticated');
            return null;
        }

        try {
            // Get user profile data including stats
            const userDocRef = doc(db, 'players', this.getUserId());
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                console.log('No user document found');
                return {
                    stats: { money: 0, metaUpgrades: [] },
                    totalRuns: 0,
                    recentRuns: [],
                    bestScore: 0,
                    userProfile: {},
                    vkUser: this.vkUser
                };
            }

            const userProfile = userDoc.data();

            // Get runs data
            const userRunsRef = collection(db, 'players', this.getUserId(), 'runs');
            const q = query(userRunsRef, orderBy('timestamp', 'desc'), limit(10));
            const querySnapshot = await getDocs(q);

            const runs = [];
            querySnapshot.forEach((doc) => {
                runs.push({ id: doc.id, ...doc.data() });
            });

            // Extract stats data and ensure it has the right structure
            let statsData = userProfile.stats || { money: 0, metaUpgrades: [] };

            // Ensure metaUpgrades is an array (List<MetaUpgradeData>)
            if (!Array.isArray(statsData.metaUpgrades)) {
                statsData.metaUpgrades = [];
            }

            console.log('Loaded player stats from Firebase:', statsData);

            return {
                totalRuns: runs.length,
                recentRuns: runs,
                bestScore: runs.length > 0 ? Math.max(...runs.map(r => r.score)) : 0,
                userProfile: userProfile,
                stats: statsData,
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