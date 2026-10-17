import * as Blockly from "blockly/core";

/**
 * Blockly 13 only rotates the trashcan lid while the trashcan already holds
 * deleted blocks: the open-state rotation in its stylesheet requires the
 * `blocklyTrashFull` class, which appears only after the first deletion. Open
 * the lid for every drag-over instead, so the drop target reads consistently
 * even when the trashcan is empty.
 *
 * Registered rules are appended after Blockly's own styles, so an
 * equal-specificity selector wins by source order.
 */
export const trashcanLidOverrideCss = `.blocklyTrash.blocklyTrashOpen .blocklyTrashLid { rotate: 45deg; }
.blocklyRTL .blocklyTrash.blocklyTrashOpen .blocklyTrashLid { rotate: -45deg; }`;

Blockly.Css.register(trashcanLidOverrideCss);
