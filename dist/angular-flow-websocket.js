'use strict';

/**
 * @ngdoc service
 * @name ngFlowThingsApp.FlowWebsocket
 * @description
 * # FlowWebsocket
 * Factory in the ngFlowThingsApp.
 */
angular.module('ngFlowThings')
    .factory('FlowWebsocket', function ($http, $websocket, $q, $interval) {

        var isDefined   = angular.isDefined,
            isUndefined = angular.isUndefined;

        var socket;
        var subscriptions = {};

        var connectionDeferred = $q.defer();

        var flowOptions = {
            baseMsgId: 1,
            heartbeat: {
                message: JSON.stringify({
                    "type": "heartbeat"
                }),
                interval: 20000
            },
            errors: {
                NO_CREDENTIALS: 'Provide account Id and token',
                NO_SESSION_ID: 'No session ID'
            }
        };

        var AngularFlow = {
            flow: {
                subscribe: subscribeToFlow,
                unsubscribe: unsubscribeFromFlow
            }
        };

        return connect;

        function acquireSessionId(accountId, token) {
            return $http({
                method: 'POST',
                url: 'https://ws.flowthings.io/session',
                headers: {
                    'X-Auth-Account': accountId,
                    'X-Auth-Token': token
                }
            });
        }

        function connect(credentials, options) {
            if (isUndefined(credentials.accountId) || isUndefined(credentials.token))
                handleError(flowOptions.errors.NO_CREDENTIALS);

            acquireSessionId(credentials.accountId, credentials.token)
                .success(function (data) {
                    if (data.head.ok === true || data.head.ok === 'true') {
                        initSocket(data.body.id);
                        startHeartBeat(flowOptions.heartbeat.interval);
                    } else {
                        handleError(parseFlowErrors(data.body.errors));
                    }
                })
                .error(function (error) {
                    handleError(error);
                });

            return AngularFlow;
        }

        function startHeartBeat(interval) {
            $interval(function () {
                socket.send(flowOptions.heartbeat.message);
            }, interval);
        }

        function initSocket(sessionId) {
            if (isUndefined(sessionId))
                handleError(flowOptions.errors.NO_SESSION_ID);

            socket = $websocket('wss://ws.flowthings.io/session/' + sessionId + '/ws');

            socket.onOpen(function (e) {
                connectionDeferred.resolve();
                console.log('opened', e);
            });

            socket.onClose(function (e) {
                console.log('closed', e);
            });

            socket.onError(function (e) {
                console.log('error', e);
            });
            
            socket.onMessage(function (e) {
                var data = JSON.parse(e.data);
                
                console.log(data);

                if (data.type === 'message') {
                    var flowId = data.value.flowId;

                    if (isDefined(subscriptions[flowId])) {
                        subscriptions[flowId](data.value);
                    }
                }
            });
        }
        
        function subscribeToFlow(flowId, listener) {
            connectionDeferred.promise.then(function () {
                sendMessage('subscribe', flowId);

                if (angular.isFunction(listener))
                    subscriptions[flowId] = listener;
            });
        }

        function unsubscribeFromFlow(flowId) {
            connectionDeferred.promise.then(function () {
                sendMessage('unsubscribe', flowId);

                delete subscriptions[flowId];
            });
        }

        function sendMessage(type, flowId, messageId) {
            connectionDeferred.promise.then(function () {
                var msgId = messageId || flowOptions.baseMsgId++;

                socket.send({
                    msgId: msgId,
                    object: 'drop',
                    type: type,
                    flowId: flowId
                });
            });
        }

        function parseFlowErrors(errors) {
            return errors.join('\n');
        }

        function handleError(message) {
            throw new Error(message);
        }
        
    });
