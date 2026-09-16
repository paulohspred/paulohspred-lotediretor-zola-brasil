import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

export default helper(function spLayerSwatchStyle([color]) {
  return htmlSafe(
    `display:inline-block;width:0.75rem;height:0.75rem;flex:0 0 0.75rem;margin-top:0.2rem;background:${color};border:1px solid rgba(0,0,0,.25);`
  );
});
