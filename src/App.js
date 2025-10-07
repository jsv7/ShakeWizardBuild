import './App.css';
import React, { Fragment, useState, useCallback, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import bridge from '@vkontakte/vk-bridge';
import { RotatingLines } from "react-loader-spinner";
import firebaseService from './firebase/FirebaseService';

function Loader() {
    return (
        <RotatingLines
            strokeColor="green"
            strokeWidth="5"
            animationDuration="30"
            width="96"
            visible={true}
        />
    )
}

// Initialize VK Bridge
async function initVK() {
    try {
        // Initialize VK Bridge
        await bridge.send('VKWebAppInit');
        console.log('VK Bridge initialized successfully');

        // Get user info
        const userInfo = await bridge.send('VKWebAppGetUserInfo');
        console.log('User info:', userInfo);

        // Set view settings for better mobile experience
        await bridge.send('VKWebAppSetViewSettings', {
            status_bar_style: 'light',
            action_bar_color: '#000000'
        });

    } catch (error) {
        console.error('VK Bridge initialization failed:', error);
    }
}

// Initialize VK on app start
(async () => {
    await initVK();
})();

function App() {
    const [userInfo, setUserInfo] = useState(null);
    const [firebaseReady, setFirebaseReady] = useState(false);

    const { unityProvider, addEventListener, removeEventListener, loadingProgression, isLoaded, sendMessage } = useUnityContext({
        loaderUrl: "Assets/WEBGL.loader.js",
        dataUrl: "Assets/WEBGL.data.unityweb",
        frameworkUrl: "Assets/WEBGL.framework.js.unityweb",
        codeUrl: "Assets/WEBGL.wasm.unityweb",
    });

    // Initialize Firebase when component mounts
    useEffect(() => {
        const initFirebase = async () => {
            const success = await firebaseService.initializeAuth();
            setFirebaseReady(success);

            if (success) {
                console.log('Firebase ready for WebGL build');
                // Notify Unity that Firebase is ready
                if (isLoaded) {
                    sendMessage("FirebaseManager", "OnWebFirebaseReady", firebaseService.getUserId() || "");
                }
            }
        };

        initFirebase();
    }, [isLoaded, sendMessage]);


    useEffect(() => {
        async function fetchVKUser() {
            try {
                const user = await bridge.send('VKWebAppGetUserInfo');
                setUserInfo(user);

                // Initialize Firebase with VK user info (instead of anonymous)
                const success = await firebaseService.initializeAuth(user);
                setFirebaseReady(success);

                console.log("VK User ID:", user.id);
            } catch (err) {
                console.error("Failed to get VK user info:", err);
            }
        }

        fetchVKUser();
    }, []);

    // VK Haptic feedback functions
    function hapticSoft() {
        bridge.send('VKWebAppTapticNotificationOccurred', { type: 'success' })
            .catch(err => console.log('Haptic feedback not supported:', err));
    }

    function hapticMedium() {
        bridge.send('VKWebAppTapticImpactOccurred', { style: 'medium' })
            .catch(err => console.log('Haptic feedback not supported:', err));
    }

    const handleHapticSoft = useCallback(() => {
        hapticSoft();
    }, []);

    const handleHapticMedium = useCallback(() => {
        hapticMedium();
    }, []);

    // Share score function for VK
    const shareScore = useCallback(async (score) => {
        try {
            await bridge.send('VKWebAppShare', {
                link: window.location.href
            });
        } catch (error) {
            console.error('Share failed:', error);
        }
    }, []);

    // Firebase functions called from Unity
    const saveRunData = useCallback(async (runDataJson) => {
        try {
            const runData = JSON.parse(runDataJson);
            console.log('Unity requested save:', runData);

            const success = await firebaseService.saveRunToFirebase(runData);

            // Send result back to Unity
            sendMessage("FirebaseManager", "OnWebFirebaseSaveComplete", success ? "true" : "false");

            return success;
        } catch (error) {
            console.error('Failed to save run data:', error);
            sendMessage("FirebaseManager", "OnWebFirebaseSaveComplete", "false");
            return false;
        }
    }, [sendMessage]);

    const saveStatsData = useCallback(async (statsDataString) => {
        try {
            const statsData = JSON.parse(statsDataString); // Contains money, metaUpgrades, AND artifacts
            console.log('Unity requested stats save:', statsData);

            const success = await firebaseService.savePlayerStats(statsData);

            sendMessage("FirebaseManager", "OnWebFirebaseStatsSaveComplete", success ? "true" : "false");

            return success;
        } catch (error) {
            console.error('Failed to save stats data:', error);
            sendMessage("FirebaseManager", "OnWebFirebaseStatsSaveComplete", "false");
            return false;
        }
    }, [sendMessage]);

// This already handles artifacts because it returns the entire stats object
    const getPlayerStats = useCallback(async () => {
        try {
            const stats = await firebaseService.getPlayerStats();

            // Extract just the stats data for Unity (includes money, metaUpgrades, AND artifacts)
            const statsForUnity = stats?.stats || {
                money: 0,
                metaUpgrades: [],
                artifacts: [] // Already included in the stats object
            };

            console.log('Sending stats to Unity:', statsForUnity);

            const statsJson = JSON.stringify(statsForUnity);
            sendMessage("FirebaseManager", "OnWebFirebaseStatsReceived", statsJson);

            return stats;
        } catch (error) {
            console.error('Failed to get player stats:', error);
            const emptyStats = {
                money: 0,
                metaUpgrades: [],
                artifacts: [] // Include empty artifacts array
            };
            sendMessage("FirebaseManager", "OnWebFirebaseStatsReceived", JSON.stringify(emptyStats));
            return null;
        }
    }, [sendMessage]);

    const getFirebaseStatus = useCallback(() => {
        const status = {
            isReady: firebaseReady,
            isAuthenticated: firebaseService.isAuthenticated(),
            userId: firebaseService.getUserId()
        };

        sendMessage("FirebaseManager", "OnWebFirebaseStatusReceived", JSON.stringify(status));
        return status;
    }, [firebaseReady, sendMessage]);

    // VK Ads: Show rewarded ad for revival
    const showRewardedAd = useCallback(async () => {
        try {
            console.log('========== SHOWING VK REWARDED AD ==========');
            console.log('Current URL:', window.location.href);
            console.log('Hostname:', window.location.hostname);

            // Development mode detection (only localhost, NOT vk-apps.com staging)
            const isDevelopment = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';

            if (isDevelopment) {
                console.log('⚠️ Development mode detected - simulating ad success in 2 seconds');
                console.log('Note: Real VK ads only work in production VK Mini App');

                // Simulate ad watching delay
                setTimeout(() => {
                    console.log('✅ [DEV MODE] Simulated ad watched successfully!');
                    sendMessage("VKAdsManager", "OnAdWatchSuccess", "");
                }, 2000);

                return;
            }

            // Production mode - use real VK ads
            console.log('🎯 Production mode - attempting to show real VK ad');

            // Method 1: Check ad availability
            console.log('Step 1: Checking ad availability...');
            let adsAvailable;
            try {
                adsAvailable = await bridge.send('VKWebAppCheckNativeAds', {
                    ad_format: 'reward'
                });
                console.log('Ad availability response:', adsAvailable);
            } catch (checkError) {
                console.error('❌ Failed to check ad availability:', checkError);
                console.log('Trying to show ad anyway...');
            }

            if (adsAvailable && !adsAvailable.result) {
                console.log('⚠️ Ads reported as not available');
                console.log('Full response:', JSON.stringify(adsAvailable));
                console.log('Possible reasons:');
                console.log('- App not approved for ads in VK settings');
                console.log('- Ads not enabled in VK Developer settings');
                console.log('- User has premium VK account (no ads)');
                console.log('- Region restrictions');

                sendMessage("VKAdsManager", "OnAdWatchFailed", "Ads not available in VK settings");
                return;
            }

            // Method 2: Show the ad
            console.log('Step 2: Showing rewarded ad...');
            const result = await bridge.send('VKWebAppShowNativeAds', {
                ad_format: 'reward'
            });

            console.log('Ad show result:', result);
            console.log('Full result object:', JSON.stringify(result));

            if (result && result.result === true) {
                // Ad was watched successfully
                console.log('✅ Ad watched successfully!');
                sendMessage("VKAdsManager", "OnAdWatchSuccess", "");
            } else {
                // Ad failed or was skipped
                console.log('⚠️ Ad was not watched or failed');
                console.log('Result details:', result);
                sendMessage("VKAdsManager", "OnAdWatchFailed", "User cancelled or ad failed");
            }

            console.log('========== END AD ATTEMPT ==========');

        } catch (error) {
            console.error('❌ VK Ad error:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.error_code,
                data: error.error_data
            });
            sendMessage("VKAdsManager", "OnAdWatchFailed", error.message || "Unknown error");
        }
    }, [sendMessage]);

    // VK Ads: Check if ads are available
    const checkAdAvailability = useCallback(async () => {
        try {
            console.log('========== CHECKING AD AVAILABILITY ==========');
            console.log('Current URL:', window.location.href);
            console.log('Hostname:', window.location.hostname);
            console.log('VK User ID:', userInfo?.id);

            const result = await bridge.send('VKWebAppCheckNativeAds', {
                ad_format: 'reward'
            });

            console.log('Raw VK response:', JSON.stringify(result, null, 2));

            const isAvailable = result.result || false;
            console.log('Ad availability result:', isAvailable);

            if (!isAvailable && result.error_type) {
                console.error('Error type:', result.error_type);
                console.error('Error data:', result.error_data);
            }

            // Additional diagnostics
            if (!isAvailable) {
                console.log('⚠️ TROUBLESHOOTING INFO:');
                console.log('1. Is your app published in VK?');
                console.log('2. Is monetization enabled in dev.vk.com settings?');
                console.log('3. Does your app have enough MAU (Monthly Active Users)?');
                console.log('4. Are you testing from supported region (Russia)?');
                console.log('5. Contact miniapps@vk.com to request ad access');
            }

            sendMessage("VKAdsManager", "OnAdAvailabilityResult", isAvailable ? "true" : "false");
            console.log('========== END AD AVAILABILITY CHECK ==========');

        } catch (error) {
            console.error('❌ Failed to check ad availability:', error);
            console.error('Error details:', {
                message: error.message,
                code: error.error_code,
                type: error.error_type
            });
            sendMessage("VKAdsManager", "OnAdAvailabilityResult", "false");
        }
    }, [sendMessage, userInfo]);

    useEffect(() => {
        // Get user info on component mount
        bridge.send('VKWebAppGetUserInfo')
            .then(user => setUserInfo(user))
            .catch(err => console.error('Failed to get user info:', err));

        // Unity event listeners for VK integration
        addEventListener("HapticSoft", handleHapticSoft);
        addEventListener("HapticMedium", handleHapticMedium);
        addEventListener("ShareScore", shareScore);

        // Unity event listeners for Firebase integration
        addEventListener("SaveRunToFirebase", saveRunData);
        addEventListener("GetPlayerStats", getPlayerStats);
        addEventListener("GetFirebaseStatus", getFirebaseStatus);

        // Custom event listeners for WebGL JSLib communication
        const handleUnitySaveRun = (event) => {
            saveRunData(event.detail.data);
        };

        const handleUnityGetStats = () => {
            getPlayerStats();
        };

        const handleUnityGetFirebaseStatus = () => {
            getFirebaseStatus();
        };

        // Handle stats saving from Unity
        const handleUnitySaveStats = (event) => {
            saveStatsData(event.detail.data);
        };

        // Handle rewarded ad request from Unity
        const handleUnityShowRewardedAd = () => {
            showRewardedAd();
        };

        // Handle ad availability check from Unity
        const handleUnityCheckAdAvailability = () => {
            checkAdAvailability();
        };

        // Event listeners
        window.addEventListener('unity-save-run', handleUnitySaveRun);
        window.addEventListener('unity-get-stats', handleUnityGetStats);
        window.addEventListener('unity-get-firebase-status', handleUnityGetFirebaseStatus);
        window.addEventListener('unity-save-stats', handleUnitySaveStats);
        window.addEventListener('unity-show-rewarded-ad', handleUnityShowRewardedAd);
        window.addEventListener('unity-check-ad-availability', handleUnityCheckAdAvailability);

        return () => {
            // VK cleanup
            removeEventListener("HapticSoft", handleHapticSoft);
            removeEventListener("HapticMedium", handleHapticMedium);
            removeEventListener("ShareScore", shareScore);

            // Firebase cleanup
            removeEventListener("SaveRunToFirebase", saveRunData);
            removeEventListener("GetPlayerStats", getPlayerStats);
            removeEventListener("GetFirebaseStatus", getFirebaseStatus);

            // Custom events cleanup
            window.removeEventListener('unity-save-run', handleUnitySaveRun);
            window.removeEventListener('unity-get-stats', handleUnityGetStats);
            window.removeEventListener('unity-get-firebase-status', handleUnityGetFirebaseStatus);
            window.removeEventListener('unity-save-stats', handleUnitySaveStats);
            window.removeEventListener('unity-show-rewarded-ad', handleUnityShowRewardedAd);
            window.removeEventListener('unity-check-ad-availability', handleUnityCheckAdAvailability);
        };
    }, [addEventListener, removeEventListener, handleHapticSoft, handleHapticMedium, shareScore, saveRunData, saveStatsData, getPlayerStats, getFirebaseStatus, showRewardedAd, checkAdAvailability]);

    useEffect(() => {
        if (userInfo?.id) {
            window.VK_USER_ID = userInfo.id.toString(); // expose globally
        }
    }, [userInfo]);

    return (
        <Fragment>
            <div className="center">
                <Loader />
                {!isLoaded && (
                    <div className="loading-overlay">
                        <div className="loading-spinner"></div>
                        <p>Loading: {Math.round(loadingProgression * 100)}%</p>
                        {firebaseReady && <p>Firebase Ready</p>}
                    </div>
                )}
            </div>

            <Unity
                style={{
                    width: "100vw",   // Full viewport width
                    height: "100vh",  // Full viewport height
                    position: "absolute",
                    top: 0,
                    left: 0,
                }}
                devicePixelRatio={window.devicePixelRatio}
                unityProvider={unityProvider}
            />
        </Fragment>
    );
}

export default App;