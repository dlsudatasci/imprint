/**
 * The "What to Box" list beside the canvas for annotators (4 Oct 2026).
 *
 * Groups and order follow the manuscript's obstruction categories table
 * (tab:obstruction_categories in chapter_4.tex). Annotators box these objects
 * anywhere in the image, so no description says "on the sidewalk". The rules
 * come from chapter_4.tex lines 59 and 61 and the sign decision of 4 Oct 2026.
 */
const entry = (value, label, description) => Object.freeze({ value, label, description });

export const TAXONOMY_GUIDE = Object.freeze([
  Object.freeze({
    group: "Temporary",
    items: Object.freeze([
      entry("car", "Car", "Any motor vehicle with four or more wheels: cars, SUVs, vans, pickups, jeepneys, trucks, buses"),
      entry("motorcycle", "Motorcycle", "Motorcycles"),
      entry("tricycle", "Tricycle", "Motorized or pedal tricycles, including pedicabs"),
      entry("bicycle", "Bicycle", "Bicycles"),
      entry("street_vendor_cart", "Street Vendor Cart", "Mobile vendor stalls or carts"),
      entry("construction_materials", "Construction Materials", "Building materials, scaffolding, temporary barriers, traffic cones"),
      entry("garbage", "Garbage", "Waste, trash bags or debris, one box per pile"),
      entry("movable_signage", "Movable Signage", "A-frames, sandwich boards, temporary signs"),
    ]),
  }),
  Object.freeze({
    group: "Permanent",
    items: Object.freeze([
      entry("trash_bin", "Trash Bin", "Fixed or semi-fixed waste bins"),
      entry("utility_post", "Utility Post", "Power, telephone and other utility poles"),
      entry("lamp_post", "Lamp Post", "Street lighting poles"),
      entry("street_sign", "Street Sign", "Traffic, directional and regulatory signs. A sign on its own post is one box down to the ground"),
      entry("fire_hydrant", "Fire Hydrant", "Fire hydrants"),
      entry("electrical_box", "Electrical Box", "Transformer boxes, junction boxes, utility cabinets"),
      entry("bench", "Bench", "Fixed public seating"),
      entry("tree", "Tree", "Trees, one box per tree"),
      entry("potted_plant", "Potted Plant", "Large potted plants"),
      entry("bollard", "Bollard", "Posts or barriers fixed to the ground"),
    ]),
  }),
]);

export const TAXONOMY_RULES = Object.freeze([
  "Box every one you can see, on the sidewalk or not.",
  "Do not box anything else, such as people, animals, buildings, or cracks and holes in the pavement.",
  "Skip objects smaller than about 20 by 20 pixels.",
  "Partly hidden: box what you can see, only if you can tell what it is and about a quarter or more is visible.",
  "Cut off by the image edge: box the part you can see.",
  "One box per object. A pile of garbage gets one box per pile.",
  "A sign fixed to a utility post or lamp post is not boxed on its own. Box the post.",
  "If two suggested boxes cover the same object, keep one, fix it to fit, and mark the other Not an object.",
]);
