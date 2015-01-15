'use strict';

angular.module('deckApp.pipelines.stage.deploy')
  .directive('deployInitializer', function() {
    return {
      restrict: 'E',
      scope: {
        stage: '=',
        application: '=',
      },
      templateUrl: 'scripts/modules/pipelines/config/stages/deploy/deployInitializer.html',
      controller: 'DeployInitializerCtrl',
      controllerAs: 'deployInitializerCtrl'
    };
  })
  .controller('DeployInitializerCtrl', function($scope, serverGroupService, securityGroupService, deploymentStrategiesService, _) {
    var controller = this;

    $scope.command = {
      strategy: null,
      template: null
    };

    $scope.templates = [
      { label: 'None', serverGroup: null, cluster: null }
    ];

    var allClusters = _.groupBy($scope.application.serverGroups, function(serverGroup) {
      return [serverGroup.cluster, serverGroup.account, serverGroup.region].join(':');
    });

    _.forEach(allClusters, function(cluster) {
      var latest = _.sortBy(cluster, 'name').pop();
      $scope.templates.push({
        cluster: latest.cluster,
        label: latest.cluster + ' (' + latest.account + ' - ' + latest.region + ')',
        serverGroupName: latest.name,
        serverGroup: latest
      });
    });

    deploymentStrategiesService.listAvailableStrategies().then(function (strategies) {
      $scope.deploymentStrategies = strategies;
    });

    function transformCommandToStage(command) {
      // this is awful but this is the world we live in
      var zones = command.availabilityZones;
      command.availabilityZones = {};
      command.availabilityZones[command.region] = zones;
      if (command.securityGroups) {
        var securityGroups = command.securityGroups.map(function (securityGroupId) {
          return securityGroupService.getApplicationSecurityGroup($scope.application, command.credentials, command.region, securityGroupId).name;
        });
        command.securityGroups = securityGroups;
      }
      $scope.stage.cluster = command;
      $scope.stage.account = command.credentials;
      $scope.stage.cluster.strategy = $scope.command.strategy;

      delete command.credentials;
    }

    function clearTemplate() {
      serverGroupService.buildNewServerGroupCommand($scope.application).then(function(command) {
        transformCommandToStage(command);
      });
    }

    controller.selectTemplate = function (selection) {
      selection = selection || $scope.command.template;
      if (selection && selection.cluster && selection.serverGroup) {
        var latest = selection.serverGroup;
        serverGroupService.getServerGroup($scope.application.name, latest.account, latest.region, latest.name).then(function (details) {
          angular.extend(details, latest);
          serverGroupService.buildServerGroupCommandFromExisting($scope.application, details).then(function (command) {
            command.instanceType = details.launchConfig.instanceType;
            transformCommandToStage(command);
          });
        });
      } else {
        clearTemplate();
      }
    };

    function updateStrategy() {
      controller.selectTemplate();
    }

    $scope.$watch('command.strategy', updateStrategy);

    controller.useTemplate = function() {
      if (!$scope.stage.cluster) {
        clearTemplate();
      }
      delete $scope.stage.uninitialized;
    };
  });
