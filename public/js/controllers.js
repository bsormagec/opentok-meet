angular.module('opentok-meet').controller('RoomCtrl', ['$scope', '$http', '$window', '$document',
    '$timeout', 'OTSession', 'RoomService', 'baseURL', 'mouseMoveTimeoutTime', 'fakeDevices',
    function($scope, $http, $window, $document, $timeout, OTSession, RoomService, baseURL,
      mouseMoveTimeoutTime, fakeDevices) {
  $scope.streams = OTSession.streams;
  $scope.connections = OTSession.connections;
  $scope.publishing = false;
  $scope.archiveId = null;
  $scope.archiving = false;
  $scope.isAndroid = /Android/g.test(navigator.userAgent);
  $scope.connected = false;
  $scope.mouseMove = false;
  $scope.showWhiteboard = false;
  $scope.showEditor = false;
  $scope.whiteboardUnread = false;
  $scope.editorUnread = false;
  $scope.leaving = false;

  var facePublisherPropsHD = {
    name: 'face',
    width: '100%',
    height: '100%',
    style: {
      nameDisplayMode: 'off'
    },
    resolution: '1280x720',
    frameRate: 30
  },
    facePublisherPropsSD = {
      name: 'face',
      width: '100%',
      height: '100%',
      style: {
        nameDisplayMode: 'off'
      }
    };
  if (fakeDevices) {  // This is a property set by protractor
    facePublisherPropsHD.constraints = facePublisherPropsSD.constraints = {
      audio: true,
      video: true,
      fake: true  // Use fake devices for Firefox
    };
  }
  $scope.facePublisherProps = facePublisherPropsHD;

  $scope.notMine = function(stream) {
    return stream.connection.connectionId !== $scope.session.connection.connectionId;
  };

  $scope.togglePublish = function(publishHD) {
    if (!$scope.publishing) {
      $scope.facePublisherProps = publishHD ? facePublisherPropsHD : facePublisherPropsSD;
    }
    $scope.publishing = !$scope.publishing;
  };

  var startArchiving = function() {
    $scope.archiving = true;
    $http.post(baseURL + $scope.room + '/startArchive').success(function(response) {
      if (response.error) {
        $scope.archiving = false;
        console.error('Failed to start archive', response.error);
      } else {
        $scope.archiveId = response.archiveId;
      }
    }).error(function(data) {
      console.error('Failed to start archiving', data);
      $scope.archiving = false;
    });
  };

  var stopArchiving = function() {
    $scope.archiving = false;
    $http.post(baseURL + $scope.room + '/stopArchive', {
      archiveId: $scope.archiveId
    }).success(function(response) {
      if (response.error) {
        console.error('Failed to stop archiving', response.error);
        $scope.archiving = true;
      } else {
        $scope.archiveId = response.archiveId;
      }
    }).error(function(data) {
      console.error('Failed to stop archiving', data);
      $scope.archiving = true;
    });
  };

  $scope.toggleArchiving = function() {
    if ($scope.archiving) {
      stopArchiving();
    } else {
      startArchiving();
    }
  };

  $scope.toggleWhiteboard = function() {
    $scope.showWhiteboard = !$scope.showWhiteboard;
    $scope.whiteboardUnread = false;
    setTimeout(function() {
      $scope.$emit('otLayout');
    }, 10);
  };

  $scope.toggleEditor = function() {
    $scope.showEditor = !$scope.showEditor;
    $scope.editorUnread = false;
    setTimeout(function() {
      $scope.$emit('otLayout');
      $scope.$broadcast('otEditorRefresh');
    }, 10);
  };

  // Fetch the room info
  RoomService.getRoom().then(function(roomData) {
    if ($scope.session) {
      $scope.session.disconnect();
    }
    $scope.p2p = roomData.p2p;
    $scope.room = roomData.room;
    $scope.shareURL = baseURL === '/' ? $window.location.href : baseURL + roomData.room;

    OTSession.init(roomData.apiKey, roomData.sessionId, roomData.token, function(err, session) {
      $scope.session = session;
      var connectDisconnect = function(connected) {
        $scope.$apply(function() {
          $scope.connected = connected;
          if (!connected) {
            $scope.publishing = false;
          }
        });
      };
      if ((session.is && session.is('connected')) || session.connected) {
        connectDisconnect(true);
      }
      $scope.session.on('sessionConnected', connectDisconnect.bind($scope.session, true));
      $scope.session.on('sessionDisconnected', connectDisconnect.bind($scope.session, false));
      $scope.session.on('archiveStarted archiveStopped', function(event) {
        // event.id is the archiveId
        $scope.$apply(function() {
          $scope.archiveId = event.id;
          $scope.archiving = (event.type === 'archiveStarted');
        });
      });
      var whiteboardUpdated = function() {
        if (!$scope.showWhiteboard && !$scope.whiteboardUnread) {
          // Someone did something to the whiteboard while we weren't looking
          $scope.$apply(function() {
            $scope.whiteboardUnread = true;
            $scope.mouseMove = true; // Show the bottom bar
          });
        }
      };
      var editorUpdated = function() {
        if (!$scope.showEditor && !$scope.editorUnread) {
          // Someone did something to the editor while we weren't looking
          $scope.$apply(function() {
            $scope.editorUnread = true;
            $scope.mouseMove = true; // Show the bottom bar
          });
        }
      };
      $scope.$on('otEditorUpdate', editorUpdated);
      $scope.$on('otWhiteboardUpdate', whiteboardUpdated);
    });
    $scope.publishing = true;
  });

  $scope.changeRoom = function() {
    if (!$scope.leaving) {
      $scope.leaving = true;
      $scope.session.disconnect();
      $scope.session.on('sessionDisconnected', function() {
        $scope.$apply(function() {
          RoomService.changeRoom();
        });
      });
    }
  };

  $scope.sendEmail = function() {
    $window.location.href = 'mailto:?subject=Let\'s Meet&body=' + $scope.shareURL;
  };

  var mouseMoveTimeout;
  var mouseMoved = function() {
    if (!$scope.mouseMove) {
      $scope.$apply(function() {
        $scope.mouseMove = true;
      });
    }
    if (mouseMoveTimeout) {
      clearTimeout(mouseMoveTimeout);
    }
    mouseMoveTimeout = setTimeout(function() {
      $scope.$apply(function() {
        $scope.mouseMove = false;
      });
    }, mouseMoveTimeoutTime);
  };
  $window.addEventListener('mousemove', mouseMoved);
  $window.addEventListener('touchstart', mouseMoved);
  $document.context.body.addEventListener('orientationchange', function() {
    $scope.$emit('otLayout');
  });

  $scope.$on('$destroy', function() {
    if ($scope.session && $scope.connected) {
      $scope.session.disconnect();
      $scope.connected = false;
    }
    $scope.session = null;
  });
}]);
