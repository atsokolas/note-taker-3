// Safari runs this in the page before the share sheet opens, so the
// extension gets the address, the title and whatever you had selected.
var GetPage = function () {};
GetPage.prototype = {
  run: function (args) {
    const selection = window.getSelection();
    const page = {
      url: document.URL,
      title: document.title,
      selection: selection?.toString().trim() || ''
    };
    if (page.selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      const block = element?.closest('p,li,blockquote,h1,h2,h3') || node;
      const before = range.cloneRange();
      const after = range.cloneRange();
      before.selectNodeContents(block);
      after.selectNodeContents(block);
      before.setEnd(range.startContainer, range.startOffset);
      after.setStart(range.endContainer, range.endOffset);
      page.prefix = before.toString().slice(-60);
      page.suffix = after.toString().slice(0, 60);
    }
    args.completionFunction(page);
  },
  finalize: function () {}
};
var ExtensionPreprocessingJS = new GetPage();
