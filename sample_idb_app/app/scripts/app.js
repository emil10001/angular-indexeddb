'use strict';

var dbParams = {
    name: 'exampleDB',
    version: 1,
    options: [
        {
            storeName: 'list-o-stuff',
            keyPath: 'id',
            indexes: [
                { name: 'name', unique: false }
            ]
        }
    ]
};

var myApp = angular.module('sampleIdbAppApp',
    [
        'ngRoute',
        'angular-indexeddb'
    ]
);

myApp.config(function ($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl: 'views/main.html',
            controller: 'MainCtrl'
        })
        .otherwise({
            redirectTo: '/'
        });
});
myApp.run(['IDB', function (IDB) {
    IDB.openDB(dbParams.name, dbParams.version, dbParams.options);
}]);