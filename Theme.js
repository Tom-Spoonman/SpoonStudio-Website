class Theme {
    constructor() {
      this.darkTheme = {
        backgroundColor: 'black',
        particleColor: 'rgba(255, 255, 255, 0.7)',
        lineColor: 'rgba(255, 255, 255, 0.1)',
        iconClass: 'dark',
        headlineColor: 'white',
      };
  
      this.lightTheme = {
        backgroundColor: 'white',
        particleColor: 'rgba(0, 0, 139, 0.7)',
        lineColor: 'rgba(0, 0, 139, 0.1)',
        iconClass: 'light',
        headlineColor: 'black',
      };
  
      this.switchWrapper = document.getElementById('switch');
      this.headline = document.querySelector('.headline');
    }
  
    applyTheme(theme) {
      document.body.style.backgroundColor = theme.backgroundColor;
      this.headline.style.color = theme.headlineColor;
      this.switchWrapper.className = `switch-wrapper ${theme.iconClass}`;
      localStorage.setItem('theme', JSON.stringify(theme));
    }
  
    applyDarkTheme() {
      this.applyTheme(this.darkTheme);
    }
  
    applyLightTheme() {
      this.applyTheme(this.lightTheme);
    }
  
    applySavedTheme() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        this.applyTheme(JSON.parse(savedTheme));
      } else {
        this.applyDarkTheme();
      }
    }
  
    toggleTheme() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme && JSON.parse(savedTheme).backgroundColor === this.darkTheme.backgroundColor) {
        this.applyLightTheme();
      } else {
        this.applyDarkTheme();
      }
    }
  }
  
  export default Theme;
  