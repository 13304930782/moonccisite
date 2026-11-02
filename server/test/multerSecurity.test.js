const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('a delayed file filter cannot crash the process after multipart teardown', () => {
  // Isolate the crash regression so an affected dependency fails this test, not the runner.
  const source = `
    const assert = require('node:assert/strict');
    const { PassThrough } = require('node:stream');
    const multer = require('multer');
    const boundary = 'mooncci-upload-regression';
    const part = name => '--' + boundary + '\\r\\nContent-Disposition: form-data; name="' + name + '"; filename="file.txt"\\r\\nContent-Type: text/plain\\r\\n\\r\\nx\\r\\n';
    const request = body => {
      const req = new PassThrough();
      req.headers = { 'content-type': 'multipart/form-data; boundary=' + boundary, 'content-length': Buffer.byteLength(body) };
      return req;
    };
    (async () => {
      const body = part('pending') + part('rejected');
      const req = request(body), rejection = new Error('rejected file');
      let resume, parser, callbacks = 0;
      await new Promise(resolve => {
        const upload = multer({
          fileHwm: 1,
          streamHandler: (incoming, stream) => { parser = stream; incoming.pipe(stream); },
          fileFilter: (incoming, file, next) => {
            if (file.fieldname === 'pending') resume = next;
            else incoming.once('end', () => setImmediate(() => next(rejection)));
          }
        }).any();
        upload(req, null, error => {
          callbacks++;
          assert.equal(error, rejection);
          assert.equal(typeof resume, 'function');
          setImmediate(() => {
            parser.once('close', resolve);
            resume(null, true);
          });
        });
        // Missing closing boundary fails parsing only after the suspended filter resumes.
        req.end(body);
      });
      assert.equal(callbacks, 1);
      assert.deepEqual(req.files, []);
      const valid = part('avatar') + '--' + boundary + '--\\r\\n';
      const next = request(valid);
      await new Promise((resolve, reject) => {
        multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: 1024 } }).single('avatar')(next, null, error => error ? reject(error) : resolve());
        next.end(valid);
      });
      assert.equal(next.file.buffer.toString(), 'x');
      process.stdout.write('survived-and-uploaded');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: path.join(__dirname, '..'), timeout: 5000, encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.equal(result.stdout, 'survived-and-uploaded');
});
