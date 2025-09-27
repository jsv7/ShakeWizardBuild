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

    const getPlayerStats = useCallback(async () => {
        try {
            const stats = await firebaseService.getPlayerStats();

            // Send stats back to Unity as JSON
            const statsJson = JSON.stringify(stats || {});
            sendMessage("FirebaseManager", "OnWebFirebaseStatsReceived", statsJson);

            return stats;
        } catch (error) {
            console.error('Failed to get player stats:', error);
            sendMessage("FirebaseManager", "OnWebFirebaseStatsReceived", "{}");
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

        window.addEventListener('unity-save-run', handleUnitySaveRun);
        window.addEventListener('unity-get-stats', handleUnityGetStats);
        window.addEventListener('unity-get-firebase-status', handleUnityGetFirebaseStatus);

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
        };
    }, [addEventListener, removeEventListener, handleHapticSoft, handleHapticMedium, shareScore, saveRunData, getPlayerStats, getFirebaseStatus]);
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
            
            {userInfo && (
                <div className="vk-user-info">
                    <p>VK User ID: {userInfo.id}</p>
                    <p>{userInfo.first_name} {userInfo.last_name}</p>
                </div>
            )}
        </Fragment>
    );
}

export default App;