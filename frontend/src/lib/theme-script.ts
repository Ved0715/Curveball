export const THEME_KEY = "curveball.theme";

/** Runs before first paint so the page never flashes the wrong theme (or the wrong world). */
export const themeScript = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="dark";}var w=location.pathname;if(w==="/bullpen"||w.indexOf("/bullpen/")===0)document.documentElement.dataset.world="work";})();`;
