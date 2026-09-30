// Aplica tema e densidade antes da pintura (evita "piscar" claro/escuro). Arquivo externo por causa da CSP.
(function () {
  try {
    var d = document.documentElement;
    var t = localStorage.getItem('almeida.tema') || 'auto';
    var escuro = t === 'escuro' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    d.setAttribute('data-theme', escuro ? 'dark' : 'light');
    if (localStorage.getItem('almeida.densidade') === 'compacta') d.setAttribute('data-densidade', 'compacta');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m && escuro) m.setAttribute('content', '#0b1120');
  } catch (e) { /* segue com o padrão claro */ }
})();
