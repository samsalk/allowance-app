// Storage for the whole app state: one private blob holding the same
// { kids, settings, transactions } JSON the app has always used. The blob's
// ETag is the optimistic-concurrency token (replaces the old `version` column).
const { get, put, BlobPreconditionFailedError, BlobNotFoundError } = require('@vercel/blob');

const PATHNAME = 'family-data.json';

function emptyData() {
    return {
        kids: [],
        settings: { allowanceDay: 'sunday', lastAllowanceDate: null, rotationWeek: 1 },
        transactions: []
    };
}

// Returns { data, etag }. etag is null when nothing has been saved yet.
async function readData() {
    let result;
    try {
        // useCache:false guarantees we see the latest version after an overwrite.
        result = await get(PATHNAME, { access: 'private', useCache: false });
    } catch (err) {
        if (err instanceof BlobNotFoundError) return { data: emptyData(), etag: null };
        throw err;
    }
    if (!result || result.statusCode !== 200 || !result.stream) {
        return { data: emptyData(), etag: null };
    }
    const text = await new Response(result.stream).text();
    return { data: JSON.parse(text), etag: result.blob.etag };
}

// Writes only if the blob is still at `etag` (or still absent when etag is
// null). Returns { ok: true, etag } or { ok: false } on a concurrent change.
async function writeData(data, etag) {
    try {
        const res = await put(PATHNAME, JSON.stringify(data), {
            access: 'private',
            contentType: 'application/json',
            allowOverwrite: etag != null,
            ...(etag != null ? { ifMatch: etag } : {}),
            cacheControlMaxAge: 60
        });
        return { ok: true, etag: res.etag };
    } catch (err) {
        if (err instanceof BlobPreconditionFailedError) return { ok: false };
        // Creating the first blob when one already exists (another device won the race).
        if (etag == null && /already exists/i.test(String(err && err.message))) return { ok: false };
        throw err;
    }
}

module.exports = { readData, writeData, emptyData };
