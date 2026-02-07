const ua = navigator.userAgent;
export const isIOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
