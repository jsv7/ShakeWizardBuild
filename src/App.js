import './App.css';
import React, { Fragment, useState, useCallback, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import bridge from '@vkontakte/vk-bridge';
import { RotatingLines } from "react-loader-spinner";

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

    const { unityProvider, addEventListener, removeEventListener, loadingProgression, isLoaded } = useUnityContext({
        loaderUrl: "Assets/WEBGL.loader.js",
        dataUrl: "Assets/WEBGL.data.unityweb",
        frameworkUrl: "Assets/WEBGL.framework.js.unityweb",
        codeUrl: "Assets/WEBGL.wasm.unityweb",
    });

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

    useEffect(() => {
        // Get user info on component mount
        bridge.send('VKWebAppGetUserInfo')
            .then(user => setUserInfo(user))
            .catch(err => console.error('Failed to get user info:', err));

        // Unity event listeners
        addEventListener("HapticSoft", handleHapticSoft);
        addEventListener("HapticMedium", handleHapticMedium);

        // You can add more Unity -> VK integrations here
        addEventListener("ShareScore", shareScore);

        return () => {
            removeEventListener("HapticSoft", handleHapticSoft);
            removeEventListener("HapticMedium", handleHapticMedium);
            removeEventListener("ShareScore", shareScore);
        };
    }, [addEventListener, removeEventListener, handleHapticSoft, handleHapticMedium, shareScore]);

    return (
        <Fragment>
            <div className="center">
                <Loader />
                {!isLoaded && (
                    <div className="loading-overlay">
                        <div className="loading-spinner"></div>
                        <p>Loading: {Math.round(loadingProgression * 100)}%</p>
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