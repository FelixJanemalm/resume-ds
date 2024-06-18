import { LottieTheming } from '@lottiefiles/lottie-theming';


const theming = new LottieTheming();
await theming.init('https://assets3.lottiefiles.com/packages/lf20_wgh8xmh0.json');
const themeConfig = theming.createConfig();

async function applyLottieTheme() {
    const theming = new LottieTheming();
    await theming.init('https://assets7.lottiefiles.com/packages/lf20_touohxv0.json'); // Replace with your Lottie file URL

    const themeConfig = theming.createConfig();
    themeConfig.Themes = [
        { name: 'DarkMode', color: '#000000' },
        { name: 'LightMode', color: '#FFFFFF' }
    ];

    const themedLottie = theming.applyTheme(themeConfig, 'DarkMode');

    // Load `themedLottie` into the Lottie player
    lottie.loadAnimation({
        container: document.getElementById('lottie-container'), // the dom element that will contain the animation
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: themedLottie // the JSON data for the themed animation
    });
}

applyLottieTheme();
