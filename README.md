# angular-flow-websocket
Angular client for FlowThings.

Currently supports:

## 1. Subscribing to and unsubscribing from Flows
```javascript
angular.module('app')
    .controller('Ctrl', function ($scope, FlowWebsocket, $timeout) {
        var credentials = {
            accountId: '< your Flow account ID >',
            token: '< your Flow token >'
        };

        var socket = FlowWebsocket(credentials);

        var flowId = '< your Flow ID >';

        socket.flow.subscribe(flowId, function (data) {
            console.log('from ctrl', data)
        });

        $timeout(function () {
            socket.flow.unsubscribe(flowId)
        }, 5000)
    });
```

## 2. Searching Flows
```javascript
socket.flow.search(flowId, query, limit)
    .then(function (drops) {
        console.log(drops)
    })
```
_query_ parameter should be written in [Flow Filter Language](https://flowthings.io/docs/flowthings-filter-language)