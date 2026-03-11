

export function isEreader(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('boox') || ua.includes('onyx');
}
