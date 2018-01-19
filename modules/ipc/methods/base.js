

const _ = require('../../utils/underscore.js');
const Q = require('bluebird');

const log = require('../../utils/logger').create('method');
const Windows = require('../../windows');
const db = require('../../db');


/**
 * Process a request.
 *
 * This is the base class for all specialized request processors.
 */
module.exports = class BaseProcessor {
    constructor(name, ipcProviderBackend) {
        this._log = log.create(name);
        this._ipcProviderBackend = ipcProviderBackend;
        this.ERRORS = this._ipcProviderBackend.ERRORS;
    }

    /**
     * Execute given request.
     * @param  {Object} conn    IPCProviderBackend connection data.
     * @param  {Object|Array} payload  payload
     * @return {Promise}
     */
    async exec(conn, payload) {
        const Web3one = require('web3-1.0');
        const web3one = new Web3one('wss://rinkeby.infura.io/ws');

        // TODO: delegate certain methods to infura/remote node if geth isn't fully synced
        if (payload.method == 'eth_getBalance') {
            console.log('∆∆∆ getBalance payload', payload);

            const r = await web3one.eth.getBalance(...payload.params);
            console.log('∆∆∆ getBalance r', r);
            return {
                isBatch: false,
                result: { jsonrpc: '2.0', id: 97, result: r.toString(16) }
            };
        }

        this._log.trace('Execute request', payload);

        const ret = await conn.socket.send(payload, {
            fullResult: true,
        });

        if (payload.method == 'eth_getBalance') {
            console.log('∆∆∆ getBalance ret!', ret);
        }

        return ret.result;
    }


    _isAdminConnection(conn) {
        // main window or popupwindows - always allow requests
        const wnd = Windows.getById(conn.id);
        const tab = db.getCollection('UI_tabs').findOne({ webviewId: conn.id });

        return ((wnd && (wnd.type === 'main' || wnd.isPopup)) ||
                (tab && _.get(tab, 'permissions.admin') === true));
    }


    /**
    Sanitize a request payload.

    This may modify the input payload object.

    @param {Object} conn The connection.
    @param {Object} payload The request payload.
    @param {Boolean} isPartOfABatch Whether it's part of a batch payload.
    */
    sanitizeRequestPayload(conn, payload, isPartOfABatch) {
        this._log.trace('Sanitize request payload', payload);

        this._sanitizeRequestResponsePayload(conn, payload, isPartOfABatch);
    }


    /**
    Sanitize a response payload.

    This may modify the input payload object.

    @param {Object} conn The connection.
    @param {Object} payload The request payload.
    @param {Boolean} isPartOfABatch Whether it's part of a batch payload.
    */
    sanitizeResponsePayload(conn, payload, isPartOfABatch) {
        this._log.trace('Sanitize response payload', payload);

        this._sanitizeRequestResponsePayload(conn, payload, isPartOfABatch);
    }


    /**
    Sanitize a request or response payload.

    This may modify the input payload object.

    @param {Object} conn The connection.
    @param {Object} payload The request payload.
    @param {Boolean} isPartOfABatch Whether it's part of a batch payload.
    */
    _sanitizeRequestResponsePayload(conn, payload, isPartOfABatch) {
        if (!_.isObject(payload)) {
            throw this.ERRORS.INVALID_PAYLOAD;
        }

        if (this._isAdminConnection(conn)) {
            return;
        }

        // prevent dapps from acccesing admin endpoints
        if (!/^eth_|^bzz_|^shh_|^net_|^web3_|^db_/.test(payload.method)) {
            delete payload.result;
            const err = _.clone(this.ERRORS.METHOD_DENIED);
            err.message = err.message.replace('__method__', `"${payload.method}"`);
            payload.error = err;
        }
    }
};
