'use strict';

angular.module('ngFlow.websocket', ['ngWebSocket'])
    .factory('FlowWebsocket', ['$http', '$websocket', '$q', '$interval', function ($http, $websocket, $q, $interval) {

        var isDefined   = angular.isDefined,
            isUndefined = angular.isUndefined,
            copy        = angular.copy,
            forEach     = angular.forEach;

        var socket,
            hearthBeatInterval,
            flowCredentials = {},
            subscriptions = {};

        var connectionDeferred = $q.defer();

        var searchId = 1,
            searchPromises = {};

        function getSearchId() {
            return 'search-' + searchId++;
        }

        var flowOptions = {
            baseMsgId: 1,
            heartbeat: {
                message: {
                    type: 'heartbeat'
                },
                interval: 20000
            },
            searchObject: function (flowId, messageId, query, limit) {
                var object = {
                    object: 'drop',
                    type: 'findmany',
                    flowId: flowId,
                    msgId: messageId,
                    options: {
                        filter: query,
                        order: 'desc',
                        hints: 0
                    }
                };

                if (limit)
                    object.options.limit = limit;

                return object;
            },
            errors: {
                NO_CREDENTIALS: 'Provide account Id and token',
                NO_SESSION_ID: 'No session ID'
            }
        };

        var AngularFlow = {
            flow: {
                subscribe: subscribeToFlow,
                unsubscribe: unsubscribeFromFlow,
                search: searchFlow
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

        function connect(credentials) {
            if (isUndefined(credentials.accountId) || isUndefined(credentials.token))
                handleError(flowOptions.errors.NO_CREDENTIALS);

            acquireSessionId(credentials.accountId, credentials.token)
                .success(function (data) {
                    if (data.head && (data.head.ok === true || data.head.ok === 'true')) {
                        flowCredentials = credentials;
                        initSocket(data.body.id);
                        startHeartBeat(flowOptions.heartbeat.interval);
                    } else {
                        handleError(parseFlowErrors(data.body.errors));
                    }
                })
                .error(handleError);

            return AngularFlow;
        }

        function startHeartBeat(interval) {
            hearthBeatInterval = $interval(function () {
                socket.send(flowOptions.heartbeat.message);
            }, interval);
        }

        function clearHearthBeat() {
            if (isDefined(hearthBeatInterval)) {
                $interval.cancel(hearthBeatInterval);
                hearthBeatInterval = undefined;
            }
        }

        function initSocket(sessionId) {
            socket = $websocket('wss://ws.flowthings.io/session/' + sessionId + '/ws');

            socket.onOpen(function (e) {
                connectionDeferred.resolve(true);
                console.log('opened', e);
            });

            socket.onClose(function (e) {
                console.log('closed', e);
                clearHearthBeat();
                connect(flowCredentials)
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
                        subscriptions[flowId](parseSingleDrop(data.value));
                    }
                } else if (isDefined(data.head)) {
                    var msgId = data.head.msgId;

                    if (isDefined(searchPromises[msgId])) {
                        searchPromises[msgId].resolve(parseSearchData(data));
                        delete searchPromises[msgId];
                    }
                }
            });
        }

        function parseSearchData(data) {
            var body = copy(data.body),
                result = [];

            forEach(body, function (drop) { result.push(parseSingleDrop(drop)) });

            return result;
        }

        function parseSingleDrop(drop) {
            var elems = copy(drop.elems);

            extractValues(elems);
            elems.creationDate = drop.creationDate;

            return elems;
        }

        function extractValues(object) {
            forEach(object, function (value, key) {
                object[key] = value.value;

                switch (value.type) {
                    case 'map':
                    case 'sortedMap':
                        extractValues(object[key]);
                        break;
                    case 'list':
                    case 'set':
                    case 'sortedSet':
                        forEach(object[key], function (obj) { extractValues(obj) });
                        break;
                }
            })
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

        function searchFlow(flowId, query, limit) {
            return connectionDeferred.promise.then(function () {
                var deferred = $q.defer(),
                    msgId = getSearchId();

                searchPromises[msgId] = deferred;

                socket.send(flowOptions.searchObject(flowId, msgId, query, limit));

                return deferred.promise;
            })
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
        
    }]);
