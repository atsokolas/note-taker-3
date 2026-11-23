/* First paint in the saved theme, before the app loads. A file, not an inline
   script, so the content security policy can forbid inline script. */
(function () {
  try {
    var defaults = {
      theme: 'auto',
      density: 'comfortable',
      typographyScale: 'default'
    };
    var raw = window.localStorage && window.localStorage.getItem('ui-settings.v1');
    var saved = raw ? JSON.parse(raw) : {};
    /* id: [scheme, family, browser bar colour]. Mirrors src/settings/themeCatalog.js. */
    var themes = {
      'light': ['light', 'editorial', '#fffcf7'],
      'dark': ['dark', 'editorial', '#16140f'],
      'tokyo-midnight': ['dark', 'palette', '#09111e'],
      'tokyo-night': ['dark', 'palette', '#1a1b26'],
      'catppuccin': ['dark', 'palette', '#1e1e2e'],
      'dracula': ['dark', 'palette', '#282a36'],
      'nord': ['dark', 'palette', '#2e3440'],
      'gruvbox-dark': ['dark', 'palette', '#1d2021'],
      'rose-pine': ['dark', 'palette', '#191724'],
      'everforest': ['dark', 'palette', '#2d353b'],
      'monokai': ['dark', 'palette', '#272822'],
      'solarized-dark': ['dark', 'palette', '#002b36'],
      'solarized-light': ['light', 'palette', '#fdf6e3'],
      'omarchy': ['dark', 'palette', '#1a1b26']
    };
    var savedTheme = String(saved.theme || '').toLowerCase();
    var themePref = themes.hasOwnProperty(savedTheme) || savedTheme === 'auto' ? savedTheme : defaults.theme;
    var activeTheme = themePref;
    if (themePref === 'auto') {
      activeTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var active = themes[activeTheme];
    var density = ['comfortable', 'compact'].indexOf(saved.density) >= 0 ? saved.density : defaults.density;
    var typography = ['small', 'default', 'large'].indexOf(saved.typographyScale) >= 0 ? saved.typographyScale : defaults.typographyScale;
    var root = document.documentElement;
    root.setAttribute('data-ui-theme', activeTheme);
    root.setAttribute('data-ui-scheme', active[0]);
    root.setAttribute('data-ui-family', active[1]);
    root.setAttribute('data-ui-theme-pref', themePref);
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.setAttribute('content', active[2]);
    }
    /* The desktop's colours, kept by src/settings/omarchyColors.js. */
    if (activeTheme === 'omarchy') {
      var omarchy = JSON.parse(window.localStorage.getItem('omarchy-colors.v1') || '{}');
      Object.keys(omarchy).forEach(function (key) {
        if (key !== 'scheme') root.style.setProperty('--omarchy-' + key, omarchy[key]);
      });
      if (omarchy.scheme === 'light') root.setAttribute('data-ui-scheme', 'light');
      if (themeColor && omarchy.background) themeColor.setAttribute('content', omarchy.background);
    }
    root.setAttribute('data-ui-density', density);
    root.setAttribute('data-ui-typography', typography);
  } catch (error) {
    document.documentElement.setAttribute('data-ui-theme', 'light');
    document.documentElement.setAttribute('data-ui-theme-pref', 'auto');
  }
}());
