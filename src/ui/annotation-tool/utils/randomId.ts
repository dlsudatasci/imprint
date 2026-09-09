/**
 * Generates the id for a newly drawn box.
 *
 * Ids only need to be unique within a single image. /api/annotationGet matches
 * saved edits back onto the model's suggestions by id, so a collision there
 * would overwrite the wrong box — which is why these are random rather than
 * sequential.
 *
 * The alphabet leaves out characters that look alike (0/O, 1/l/I, g/q, v/u).
 * These ids appear in exported data and get read aloud or typed when someone is
 * tracking down a specific annotation.
 */
export default (len = 6) => {
  const chars = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
  const maxPos = chars.length;
  let id = "";
  for (let i = 0; i < len; i++) {
    id += chars.charAt(Math.floor(Math.random() * maxPos));
  }
  return id;
};
