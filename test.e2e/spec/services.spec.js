define(['angular', 'given', 'util'], function(angular, given, util) {
  'use strict';

  describe('services', function() {
    describe('MyModel $resource', function() {
      var $injector, MyModel;
      before(function() {
        return given.servicesForLoopBackApp(
          {
            models: {
              MyModel: { name: { type: String, required: true } }
            }
          })
          .then(function(createInjector) {
            $injector = createInjector();
            MyModel = $injector.get('MyModel');
          });
      });

      it('calls server handler', function() {
        var list = MyModel.query(
          {},
          function() {
            expect(list).to.have.property('length', 0);
          },
          util.throwHttpError
        );
        return list.$promise;
      });

      it('has a custom `find` action returning array', function() {
        var list = MyModel.find(
          function() {
            expect(list).to.have.property('length', 0);
          },
          util.throwHttpError
        );
        return list.$promise;
      });

      it('can create new resource', function() {
        var obj = MyModel.create({ name: 'new' }, function() {
          expect(obj).to.have.property('name', 'new');
        });
        return obj.$promise.then(function() {
          var found = MyModel.get(
            { id: obj.id },
            function() {
              expect(found).to.have.property('name', obj.property);
            },
            util.throwHttpError);
          return found.$promise;
        });
      });

      it('can save a new resource', function() {
        var obj = new MyModel();
        obj.name = 'new-saved';

        var promise = obj.$save(
          function() {
            expect(obj.id).to.not.equal(undefined);
          },
          util.throwHttpError
        );
        return promise.then(function() {
          var found = MyModel.find(
            { filter: { where: { name: obj.name } } },
            function() {
              expect(found).to.have.length(1);
              expect(found[0].id).to.equal(obj.id);
            },
            util.throwHttpError
          );
          return found.$promise;
        });
      });

      it('can save an existing resource', function() {
        var obj = MyModel.create({ name: 'create-save' });
        return obj.$promise
          .catch(util.throwHttpError)
          .then(function() {
            obj.updated = true;
            return obj.$save().catch(util.throwHttpError);
          })
          .then(function() {
            var found = MyModel.find(
              { filter: { where: { name: obj.name } } },
              function() {
                expect(found).to.have.length(1);
                expect(found[0].id).to.equal(obj.id);
                expect(found[0].updated).to.equal(true);
              },
              util.throwHttpError
            );
            return found.$promise;
          });
      });
    });

    describe('$resource for model with funky name', function() {
      var $injector;
      before(function() {
        return given.servicesForLoopBackApp(
          {
            models: {
              'lower-case-not-an-identifier': {}
            }
          })
          .then(function(createInjector) {
            $injector = createInjector();
          });
      });

      it('has a factory name that starts with upper-case', function() {
        expect($injector.has('Lower-case-not-an-identifier')).to.equal(true);
      });
    });

    describe('with authentication', function() {
      var getNew, createInjector, $injector, User, $rootScope;
      before(function() {
        return given.servicesForLoopBackApp(
          {
            name: 'with authentication',
            models: {
              user: {
                options: {
                  base: 'User',
                  relations: {
                    accessTokens: {
                      model: 'AccessToken',
                      type: 'hasMany',
                      foreignKey: 'userId'
                    }
                  }
                }
              }
            },
            enableAuth: true
          })
          .then(function(_createInjector) {
            createInjector = _createInjector;
            getNew = function(name) {
              return createInjector().get(name);
            };
          });
      });

      beforeEach(function() {
        localStorage.clear();
        sessionStorage.clear();
        $injector = createInjector();
        User = $injector.get('User');
        $rootScope = $injector.get('$rootScope');
      });

      it('returns error for an unauthorized request', function() {
        return User.query().$promise
          .then(function() {
            throw new Error('User.query was supposed to fail.');
          }, function(res) {
            expect(res.status).to.equal(401);
          });
      });

      it('sends the authentication token when a user is logged in', function() {
        return givenLoggedInUser('user@example.com')
          .then(function(accessToken) {
            return User.get({ id: accessToken.userId }).$promise;
          })
          .then(function(user) {
            expect(user.email).to.equal('user@example.com');
          })
          .catch(util.throwHttpError);
      });

      it('clears authentication data on logout', function() {
        return givenLoggedInUser()
          .then(function() {
            return User.logout().$promise;
          })
          .then(function() {
            // NOTE(bajtos) This test is checking the LoopBackAuth.accessToken
            // property, because any HTTP request will fail regardless of the
            // Authorization header value, since the token was invalidated on
            // the server sido too.
            var auth = $injector.get('LoopBackAuth');
            expect(auth.accessTokenId, 'accessTokenId').to.equal(null);
            expect(auth.currentUserId, 'currentUserId').to.equal(null);

            // Check that localStorage was cleared too.
            auth = getNew('LoopBackAuth');
            expect(auth.accessTokenId, 'stored accessTokenId').to.equal(null);
            expect(auth.currentUserId, 'stored currentUserId').to.equal(null);
          })
          .catch(util.throwHttpError);
      });

      it('returns stub 401 for User.getCurrent when not logged in', function() {
        return User.getCurrent().$promise
          .then(function() {
            throw new Error('User.getCurrent() was supposed to fail.');
          }, function(res) {
            if (res instanceof Error) throw res;
            expect(res.status).to.equal(401);
            // check the response is a stub not coming from the server
            if (res.headers('content-type') != null) {
              throw new Error('Expected a stub response, got a real one');
            }
          });
      });

      it('persists accessToken and currentUserId', function() {
        return givenLoggedInUser('persisted@example.com')
          .then(function() {
            sessionStorage.clear(); // simulate browser restart
            return getNew('User').getCurrent().$promise;
          })
          .then(function(user) {
            expect(user.email).to.equal('persisted@example.com');
          })
          .catch(util.throwHttpError);
      });

      it('persists data in sessionStorage when rememberMe=false', function() {
        return givenLoggedInUser(null, { rememberMe: false })
          .then(function() {
            localStorage.clear(); // ensure data is not stored in localStorage
            return getNew('User').getCurrent().$promise;
          })
          .then(function() {
            expect(true); // no-op, test passed
          })
          .catch(util.throwHttpError);
      });

      it('sends User.login with include=user to by default', function() {
        return givenLoggedInUser()
          .then(function(token) {
            expect(token.user).to.be.an('object');
          });
      });

      it('can request User.login without including user data', function() {
        return givenLoggedInUser(null, { include: null })
          .then(function(token) {
            expect(token.user).to.equal(undefined);
          });
      });

      it('adds $currentUser & $ensureCurrentUser() to $rootScope', function() {
        expect($rootScope.$currentUser, '$currentUser').to.equal(null);
        expect($rootScope.$ensureCurrentUser, '$ensureCurrentUser')
          .to.be.a('function');
      });

      it('fetches $currentUser from the server', function() {
        return givenLoggedInUser(null, { include: '' }).then(function() {
          var result = $rootScope.$ensureCurrentUser();
          expect($rootScope.$currentUser, '$rootScope.$currentUser')
            .to.not.equal(null);

          return result.then(function() {
            expect($rootScope.$currentUser).to.have.property('email');
          });
        });
      });

      it('uses the value of $currentUser provided by User.login', function() {
        return givenLoggedInUser().then(function(token) {
          var result = $rootScope.$ensureCurrentUser();
          var user = $rootScope.$currentUser;
          expect(user).to.include.keys(Object.keys(token.user));
          expect(user.$resolved, '$currentUser.$resolved').to.equal(true);
          expect(result, 'result').to.equal(user.$promise);

          return result.then(function(promiseResult) {
            expect(promiseResult).to.equal(user);
          });
        });
      });

      it('clears $currentUser on 401 response', function() {
        return givenLoggedInUser().then(function(token){
          $injector.get('LoopBackAuth').accessTokenId = null;
          return User.get({ id: token.userID }).$promise
            .then(function() {
              throw new Error('User.get was supposed to fail.');
            }, function(res) {
              expect(res.status).to.equal(401);
              expect($rootScope.$currentUser).to.equal(null);
            });
        });
      });

      it('clears $currentUser on logout', function() {
        return givenLoggedInUser().then(function() {
          return User.logout().$promise.then(function() {
            expect($rootScope.$currentUser).to.equal(null);
          });
        });
      });

      var idCounter = 0;
      function givenLoggedInUser(email, loginParams) {
        var credentials = {
          email: email || 'user-' + (++idCounter) + '@example.com',
          password: 'a-password'
        };

        return User.create(credentials).$promise
          .then(function() {
            return User.login(loginParams || {}, credentials).$promise;
          });
      }
    });
  });
});
