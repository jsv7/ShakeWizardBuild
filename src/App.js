
import './App.css';
import React, { Fragment, useState, useCallback, useEffect } from "react";
import { Unity, useUnityContext } from "react-unity-webgl";
import { useHapticFeedback } from '@vkruglikov/react-telegram-web-app';

import { viewport, init, isTMA } from "@telegram-apps/sdk";

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

async function initTg() {
    if (await isTMA()) {
        init(); // init tg app

        if (viewport.mount.isAvailable()) {
            await viewport.mount();
            viewport.expand(); // first it would be better to expand
        }

        if (viewport.requestFullscreen.isAvailable()) {
            await viewport.requestFullscreen(); // then request full screen mode
        }
    }
}

(async () => {
    await initTg();
})();

function App() {
  const [isHapticSoft, setIsHapticSoft] = useState(false);
  const [isHapticMedium, setIsHapticMedium] = useState(false);

  const { unityProvider, addEventListener, removeEventListener, loadingProgression, isLoaded  } = useUnityContext({
    loaderUrl: "Assets/WEBGL.loader.js",
    dataUrl: "Assets/WEBGL.data.unityweb",
    frameworkUrl: "Assets/WEBGL.framework.js.unityweb",
    codeUrl: "Assets/WEBGL.wasm.unityweb",
  });
  const [impactOccurred, notificationOccurred, selectionChanged] =
    useHapticFeedback();

    function hapticSoft() {
      notificationOccurred('success');
    }
  function hapticMedium() {
    notificationOccurred('error');
  }

  const handleHapticSoft = useCallback(() => {
     hapticSoft();
   }, []);

   const handleHapticMedium = useCallback(() => {
      hapticMedium();
    }, []);

   useEffect(() => {
     const canvas = document.getElementById("root");
  if (canvas) {
    const newWidth = canvas.clientWidth;
    const newHeigth = canvas.clientHeigth;

    // const dpr = window.devicePixelRatio || 1;
    // canvas.width = window.innerWidth * dpr;
    // canvas.height = window.innerHeight * dpr;
    // canvas.style.width = "100vw";
    // canvas.style.height = "100vh";
  }


     addEventListener("HapticSoft", handleHapticSoft);
     addEventListener("HapticMedium", handleHapticMedium);

     return () => {
       removeEventListener("HapticSoft", handleHapticSoft);
       removeEventListener("HapticMedium", handleHapticMedium);
     };
   }, [addEventListener, removeEventListener, handleHapticSoft]);

  return (
    <Fragment >
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
      style ={{
        width: "100vw",   // Full viewport width
        height: "100vh",  // Full viewport height
        position: "absolute",
        top: 0,
        left: 0,
        }}
         unityProvider={unityProvider} />
    </Fragment>
  );
}

export default App;
