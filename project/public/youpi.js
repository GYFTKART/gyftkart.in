/**
 * YOUPI PG client SDK — vendored copy for GyftKart.
 * Source contract: https://github.com/gxurav1710/YouPI-PG
 * (apps/checkout-portal — the SDK bundle the portal serves).
 *
 * Single public surface (mirrors the gateway's own embed):
 *
 *   window.Youpi.pay({
 *     order_id, amount, currency, name, description, customer,
 *     paymentId, checkoutUrl,      <- prefilled by an authenticated
 *                                    server-side session (see
 *                                    create-youpi-payment Edge Function)
 *     handler, onSuccess, onFailed, onExpired, onCancelled, onClose
 *   }) => Promise<{ open, close, theme }>
 *
 * `pay()` opens the gateway's checkout portal (UPI QR / WhatsApp OTP /
 * app deep links) inside an iframe modal and resolves immediately with
 * an instance handle (matching YoupiCheckoutInstance in src/lib/youpi.ts).
 * The reported outcome only ever comes back via callbacks:
 *
 *   handler / onSuccess  ({ status: 'SUCCESS', order_id, utr, ... })
 *   onFailed             ({ status: 'FAILED', reason })
 *   onExpired            ({ status: 'EXPIRED' })
 *   onCancelled          ({ status: 'CANCELLED' })
 *   onClose              (customer dismissed the modal)
 *
 * The customer-facing column of the success contract is the same one the
 * YouPI README documents: { status: 'SUCCESS', order_id, amount_received,
 * utr, ... } — with `handler` and `onClose` as the primary hook names.
 */
(function () {
  'use strict';

  var CSS = [
    '.youpi-modal-backdrop{position:fixed;inset:0;z-index:2147483000;background:rgba(15,15,25,.6);',
    'display:flex;align-items:center;justify-content:center;padding:12px;backdrop-filter:blur(4px)}',
    '.youpi-modal-frame{position:relative;width:100%;max-width:480px;height:min(640px,92vh);',
    'border-radius:18px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.35);background:#fff}',
    '.youpi-modal-frame iframe{width:100%;height:100%;border:0;display:block}',
    '.youpi-modal-close{position:absolute;top:10px;right:10px;z-index:2;width:32px;height:32px;',
    'border:0;border-radius:999px;background:rgba(255,255,255,.9);color:#111;font-size:16px;',
    'line-height:1;cursor:pointer;font-weight:700}',
    '@media (max-width:640px){.youpi-modal-backdrop{align-items:flex-end;padding:0}',
    '.youpi-modal-frame{max-width:none;height:92vh;border-radius:18px 18px 0 0}}'
  ].join('');

  var active = null;

  function ensureStyles() {
    if (document.getElementById('youpi-sdk-styles')) return;
    var style = document.createElement('style');
    style.id = 'youpi-sdk-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /** Lives only as long as one checkout session. */
  function Session(options) {
    this.options = options || {};
    this.theme = (options && options.theme) || null;
    this.backdrop = null;
    this.iframe = null;
    this.boundMessage = this.onMessage.bind(this);
  }

  Session.prototype.open = function () {
    ensureStyles();
    if (this.backdrop) return;

    var backdrop = document.createElement('div');
    backdrop.className = 'youpi-modal-backdrop';
    var frame = document.createElement('div');
    frame.className = 'youpi-modal-frame';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'youpi-modal-close';
    closeBtn.setAttribute('aria-label', 'Close payment window');
    closeBtn.textContent = '\u00d7';
    var iframe = document.createElement('iframe');
    iframe.src = this.options.checkoutUrl ?? '/youpi/';
    iframe.allow = 'payment';
    frame.appendChild(closeBtn);
    frame.appendChild(iframe);
    backdrop.appendChild(frame);
    document.body.appendChild(backdrop);

    this.backdrop = backdrop;
    this.iframe = iframe;
    active = this;

    closeBtn.addEventListener('click', this.dismiss.bind(this));
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) this.dismiss();
    }.bind(this));
    window.addEventListener('message', this.boundMessage);
  };

  Session.prototype.close = function (callback) {
    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
    this.backdrop = null;
    this.iframe = null;
    if (active === this) active = null;
    window.removeEventListener('message', this.boundMessage);
    if (typeof callback === 'function') callback();
  };

  Session.prototype.dismiss = function () {
    var options = this.options;
    this.close(function () {
      if (typeof options.onClose === 'function') {
        options.onClose();
        return;
      }
      if (typeof options.onCancelled === 'function') {
        options.onCancelled({ status: 'CANCELLED', order_id: options.order_id });
        return;
      }
      if (typeof options.onFailed === 'function') {
        options.onFailed({ status: 'FAILED', order_id: options.order_id, reason: 'customer closed checkout' });
      }
    });
  };

  /** Outcome channel: the portal posts { source:'youpi', type:..., ... }. */
  Session.prototype.onMessage = function (event) {
    var msg = event && event.data;
    if (!msg || msg.source !== 'youpi') return;

    var options = this.options;
    var base = {
      order_id: msg.orderId || options.order_id || options.orderId,
      payment_mode: msg.paymentMode,
      amount_received: msg.amountReceived,
      utr: msg.utr,
      reason: msg.reason,
      raw: msg,
    };

    switch (msg.type) {
      case 'PAYMENT_SUCCESS':
        base.status = 'SUCCESS';
        this.close(function () {
          // `handler` is the primary hook in the gateway's README,
          // `onSuccess` the convenience alias.
          if (typeof options.handler === 'function') options.handler(base);
          if (typeof options.onSuccess === 'function') options.onSuccess(base);
        });
        break;
      case 'PAYMENT_FAILED':
        base.status = 'FAILED';
        this.close(function () {
          if (typeof options.onFailed === 'function') options.onFailed(base);
        });
        break;
      case 'PAYMENT_SUSPICIOUS':
        base.status = 'SUSPICIOUS';
        this.close(function () {
          if (typeof options.onFailed === 'function') options.onFailed(base);
        });
        break;
      case 'PAYMENT_EXPIRED':
        base.status = 'EXPIRED';
        this.close(function () {
          if (typeof options.onExpired === 'function') options.onExpired(base);
        });
        break;
      case 'MODAL_CLOSED':
        this.close(function () {
          if (typeof options.onClose === 'function') options.onClose();
        });
        break;
      default:
        break;
    }
  };

  function pay(options) {
    if (!options || typeof options !== 'object') {
      return Promise.reject(new Error('Youpi.pay requires an options object'));
    }
    if (!options.checkoutUrl && !options.portalUrl) {
      // The authenticated session comes from create-youpi-payment; the
      // SDK never mints one itself.
      return Promise.reject(new Error('YouPI checkout requires a server-created checkoutUrl'));
    }
    if (active) active.close();
    return new Promise(function (resolve) {
      var session = new Session(options);
      session.open();
      resolve(session);
    });
  }

  var sdk = {
    pay: pay,
    /** Dismisses the live modal (if any). */
    close: function (callback) {
      if (active) {
        active.close(callback);
      } else if (typeof callback === 'function') {
        callback();
      }
    },
    /** Internal: lets integrators push theme overrides after load. */
    configure: function (options) {
      var session = active;
      if (session && options && options.theme) session.theme = options.theme;
    }
  };

  window.Youpi = sdk;
  // Gateway bundles under both names historically.
  window.YoupiCheckout = sdk;
})();
