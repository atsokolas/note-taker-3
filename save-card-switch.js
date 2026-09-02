/**
 * The switch, on the save card.
 *
 * There is one switch in this product and this is not a second one. The rules
 * — three positions, exactly one active, a cap only while parked, what the
 * strip offers, what a promised day is called — all come from the same
 * `placementSwitchModel` the reader's app imports, and the appearance comes
 * from the same `placement-switch.css`. What differs here is the twenty lines
 * that turn a model into DOM, because the app has React for that and a Chrome
 * popup does not.
 *
 * That split is deliberate. The failure this whole surface exists to fix was
 * three controls each deciding for themselves what placement meant — two sets
 * of *rules*, not two renderers. Shipping React into a popup to avoid writing
 * a little DOM would be paying a large price for the wrong thing; duplicating
 * the rules to avoid a build step would be paying nothing and getting the
 * original bug back. Sharing the rules and writing the DOM twice is the trade
 * that actually holds.
 *
 * No build step is involved: the manifest sits at the repository root, so
 * `note-taker-ui/src` is already inside the extension package, and every file
 * in the chain is a dependency-free ES module.
 */
import {
  clockCap,
  pressPosition,
  switchPositions
} from './note-taker-ui/src/pages/placementSwitchModel.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Draws the switch into `mount` and returns a handle whose `placement` is
 * whatever the reader last chose. The card reads that at save time; nothing
 * here talks to a server, because on the save card the piece does not exist
 * yet and there is nothing to update.
 */
export const mountSaveCardSwitch = (mount, { onChange } = {}) => {
  if (!mount) return { placement: 'stream' };
  let placement = 'stream';

  const capsule = el('div', 'placement-switch__capsule');
  capsule.setAttribute('role', 'radiogroup');
  capsule.setAttribute('aria-label', 'Where this sits');

  const wrapper = el('div', 'placement-switch is-compact');
  wrapper.appendChild(capsule);
  mount.replaceChildren(wrapper);

  const draw = () => {
    capsule.replaceChildren();

    switchPositions({ placement }).forEach(({ position, label, active }) => {
      const button = el('button', `placement-switch__position${active ? ' is-active' : ''}`, label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(active));
      button.addEventListener('click', () => {
        placement = pressPosition({ placement, pressed: position });
        draw();
        onChange?.(placement);
      });
      capsule.appendChild(button);
    });

    /* The cap is drawn only while something is parked, exactly as in the app.
       On the save card it has nothing to promise yet — the piece has no id to
       promise about — so it shows the em dash and waits. */
    const cap = clockCap({ placement });
    if (cap) {
      const capNode = el('span', 'placement-switch__cap', cap.day || '—');
      capNode.setAttribute('aria-hidden', 'true');
      capsule.appendChild(capNode);
    }
  };

  draw();
  return {
    get placement() { return placement; }
  };
};
