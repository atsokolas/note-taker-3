// Safari runs this in the page before the share sheet opens, so the
// extension gets the address, the title and whatever you had selected.
var GetPage = function () {};
GetPage.prototype = {
  run: function (args) {
    args.completionFunction({
      url: document.URL,
      title: document.title,
      selection: String(window.getSelection ? window.getSelection() : '')
    });
  },
  finalize: function () {}
};
var ExtensionPreprocessingJS = new GetPage();
