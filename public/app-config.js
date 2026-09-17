// Konfig: auto by server-guard.ps1
// apiUrl — постоянный адрес API (LocalTunnel с фиксированным поддоменом).
// logoUrl — логотип всегда берём прямо с GitHub (сайт на GitHub Pages),
//           чтобы он не зависел от работы локального сервера/туннеля.
// Меняется только если сторож поднимет другой туннель — тогда файл
// перепишется автоматически и уйдёт в GitHub вместе с коммитом.
window.APP_CONFIG = {
  apiUrl: 'https://quiet-ape-25.loca.lt/api',
  logoUrl: 'https://hypevaho.github.io/vue-cafe/logo.png'
};
