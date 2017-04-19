;(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
        typeof define === 'function' && define.amd ? define(factory) :
            (global.Invoke = factory());
}(this, (function () {
    "use strict";
    /**
     * Created by rocky on 2017/4/18.
     * 只支持webviewBridage 用于webview通信
     */

    /**
     * 消息字符串转换成消息对象
     * @param {string} message
     * @return {object}
     */
    function message2Data(message) {
        try{
            message = JSON.parse(message);
            if(message === null || typeof message != "object") {
                return null;
            }
        }catch(e){
            console.error("message2Data:", e);
            return null;
        }
        return formatData(message.command, message.id, message.data, message.isReply);
    }

    /**
     * 消息对象转换成消息字符串
     * @param {object} data
     * @return {string}
     */
    function data2Message(data) {
        data = formatData(data.command, data.id, data.data, data.isReply);
        return JSON.stringify(data || "");
    }

    /**
     * 格式化数据，转换成消息对象
     * @param {string} command
     * @param {object} data
     * @param {boolean} isReply 是否是回复消息
     * @return {*}
     */
    function formatData(command, id, data, isReply) {
        if(!command || typeof command != "string") {
            return null;
        }
        return {
            command : command,
            data : data || null,
            id : id || Math.random,
            isReply : isReply || false
        };
    }

    function getReplyKey(command, id) {
        if(!command || !id) {
            return null;
        }
        return command + "-" + id;
    }

    /**
     * native 内部信息绑定
     * browser需要自己实现 window.WebViewInvokeListener 用于捆绑消息接收
     * 提供参数分别为 message消息和webview对象
     * @return {string}
     */
    function initialInject() {
        return ";(function() {" +
            "if(window.WebViewBridge) { " +
                "window.WebViewBridge.onMessage = function(message) { " +
                    "window.WebViewInvokeListener && window.WebViewInvokeListener(message, window.WebViewBridge);" +
                "};" +
                "window.WebViewBridge.onMessage();" +
            "}}());"
    }

    /**
     * invoke模块
     * native和webview通用模块
     */
    function invoke(isBrowser) {
        this.isBrowser = isBrowser === true;
        this.webview = null;
        this._store = {
            _self : {},
            _other : {}
        };
        this.listener = this.listener.bind(this);
        this.send = this.send.bind(this);
        this.initialInject = this.isBrowser ? "" : initialInject();
        //browser下自动连接
        this.connect();
        return this;
    }

    /**
     * 用于webview与native链接
     * 该函数仅限于browser使用
     */
    invoke.prototype.connect = function () {
        var that = this;
        if(window.WebViewInvokeListener || !this.isBrowser) {
            return false;
        }
        window.WebViewInvokeListener = function (message, webview) {
            if(!that.webview) {
                that.initial(webview);
            }
            that.listener(message);
        }
        return this;
    }

    /**
     * 初始化执行对象
     * @param webview
     * @return {null}
     */
    invoke.prototype.initial = function (webview) {
        if(!webview) {
            return null;
        }
        this.webview = webview;
    }

    /**
     * 定义回调
     * @param command
     * @param callback
     */
    invoke.prototype.define = function(command, callback) {
        if (!command || typeof command != "string") {
            throw new Error("define command error");
        }
        if (typeof callback != "function") {
            throw new Error("define callback error");
        }
        this._store._self[command] = callback;
    }

    /**
     * 获得另一侧的回调函数
     */
    invoke.prototype.bind = function (command, scope) {
        if(!command || typeof command != "string") {
            throw new Error("bind command is not valid")
        }
        var that = this;
        var other = this._store._other;
        return function() {
            var args = [].slice.call(arguments);
            var length = args.length;
            var callback = null;
            if(typeof args[length - 1] == "function") {
                callback = args.pop();
            }
            function reply(id, fun) {
                return function() {
                    var rs = [].slice.call(arguments);
                    delete other[id];
                    if(typeof fun == "function") {
                        fun.apply(scope || null, rs);
                    }
                }
            };
            var data = formatData(command, null, args, false);
            that.send(data);
            other[command + "-" + data.id] = reply(command + "-" + data.id, callback);
        }
    }

    /**
     * 发送消息
     */
    invoke.prototype.send = function(data) {
        try {
            var message = JSON.stringify(data);
        } catch(e) {
            console.log("invoke send error", e);
            return false;
        }
        var webview = this.webview;
        if(this.isBrowser) {
            webview && webview.send && webview.send(message);
        } else {
            webview && webview.sendToBridge && webview.sendToBridge(message)
        }
    }

    /**
     * 监听是否有消息返回
     */
    invoke.prototype.listener = function(message) {
        var send = this.send;
        var store = this._store;
        var data = message2Data(message);
        if (!data) {
            //消息格式错误
            return false;
        }
        if(data.isReply) {
            var replyKey = getReplyKey(data.command, data.id);
            if(!replyKey) {return false;}//无法生成回调key
            store._other[replyKey].apply(null, data.data);
        } else {
            var callback = function() {
                var args = [].slice.call(arguments);
                data.isReply = true;
                data.data = args;
                send(data);
            }
            data.data.push(callback);
            store._self[data.command].apply(null, data.data);
        }
    }
    return invoke;
})));
