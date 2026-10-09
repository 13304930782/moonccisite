import {JSDOM} from 'jsdom';
import createDOMPurify from '../../node_modules/dompurify/dist/purify.es.mjs';
// Isolated parsing document only. Never install a global window or execute document scripts.
const window = new JSDOM('').window;
export default createDOMPurify(window);
