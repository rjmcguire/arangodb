/* jshint browser: true */
/* jshint unused: false */
/* global arangoHelper, _, slicePath, icon, Joi, wheelnav, document, sigma, Backbone, templateEngine, $, window*/
(function () {
  'use strict';

  window.GraphViewer2 = Backbone.View.extend({
    el: '#content',

    remove: function () {
      this.$el.empty().off(); /* off to unbind the events */
      this.stopListening();
      return this;
    },

    template: templateEngine.createTemplate('graphViewer2.ejs'),

    initialize: function (options) {
      var self = this;

      this.name = options.name;
      this.userConfig = options.userConfig;
      this.documentStore = options.documentStore;
      this.initSigma();

      this.collection.fetch({
        cache: false,
        success: function (data) {
          self.model = self.collection.findWhere({_key: options.name}).toJSON();
        }
      });
    },

    events: {
      'click #downloadPNG': 'downloadSVG',
      'click #reloadGraph': 'reloadGraph',
      'click #settingsMenu': 'toggleSettings'
    },

    cursorX: 0,
    cursorY: 0,

    model: null,

    viewStates: {
      captureMode: false
    },

    graphConfig: null,
    graphSettings: null,

    initSigma: function () {
      // init sigma
      try {
        sigma.classes.graph.addMethod('neighbors', function (nodeId) {
          var k;
          var neighbors = {};
          var index = this.allNeighborsIndex[nodeId] || {};

          for (k in index) {
            neighbors[k] = this.nodesIndex[k];
          }
          return neighbors;
        });
      } catch (ignore) {}
    },

    downloadSVG: function () {
      var self = this;

      this.currentGraph.toSVG({
        download: true,
        filename: self.name + '.svg',
        size: 1000
      });
    },

    resize: function () {
      // adjust container widht + height
      $('#graph-container').width($('.centralContent').width());
      $('#graph-container').height($('.centralRow').height() - 150);
    },

    toggleSettings: function () {
      this.graphSettingsView.toggle();
    },

    render: function (toFocus) {
      this.$el.html(this.template.render({}));

      // render navigation
      $('#subNavigationBar .breadcrumb').html(
        'Graph: ' + this.name
      );

      this.resize();
      this.fetchGraph(toFocus);
    },

    rerender: function () {
      this.fetchGraph();
    },

    fetchGraph: function (toFocus) {
      var self = this;
      // arangoHelper.buildGraphSubNav(self.name, 'Content');
      $('#content').append(
        '<div id="calculatingGraph" style="position: absolute; left: 25px; top: 130px;">' +
        '<i class="fa fa-circle-o-notch fa-spin" style="margin-right: 10px;"></i>' +
        '<span id="calcText">Fetching graph data. Please wait ... </span></br></br></br>' +
        '<span style="font-weight: 100; opacity: 0.6; font-size: 9pt;">If it`s taking too much time to draw the graph, please go to: </br>' +
        '<a href="' + window.location.href + '/settings">' + window.location.href + '/settings </a></br> and adjust your settings.' +
        'It is possible that the graph is too big to be handled by the browser.</span></div>'
      );

      var continueFetchGraph = function () {
        var ajaxData = {};
        if (this.graphConfig) {
          ajaxData = _.clone(this.graphConfig);

          // remove not needed params
          delete ajaxData.layout;
          delete ajaxData.edgeType;
          delete ajaxData.renderer;
        }

        this.setupSigma();

        $.ajax({
          type: 'GET',
          url: arangoHelper.databaseUrl('/_admin/aardvark/graph/' + encodeURIComponent(this.name)),
          contentType: 'application/json',
          data: ajaxData,
          success: function (data) {
            $('#calcText').html('Calculating layout. Please wait ... ');
            // arangoHelper.buildGraphSubNav(self.name, 'Content');
            self.renderGraph(data, toFocus);
          },
          error: function (e) {
            try {
              arangoHelper.arangoError('Graph', e.responseJSON.exception);

              var found = e.responseJSON.exception.search('1205');
              if (found !== -1) {
                var string = 'Starting point: <span style="font-weight: 400">' + self.graphConfig.nodeStart + '</span> is invalid';
                $('#calculatingGraph').html(
                  '<div style="font-weight: 300; font-size: 10.5pt"><span style="font-weight: 400">Stopped. </span></br></br>' +
                  string +
                  '. Please <a style="color: #3498db" href="' + window.location.href +
                  '/settings">choose a different start node.</a></div>'
                );
              } else {
                $('#calculatingGraph').html('Failed to fetch graph information.');
              }
            } catch (ignore) {}
          }
        });
      }.bind(this);

      // load graph configuration
      this.getGraphSettings(continueFetchGraph);
    },

    setupSigma: function () {
      if (this.graphConfig) {
        if (this.graphConfig.edgeLabel) {
          // Initialize package:
          sigma.utils.pkg('sigma.settings');

          var settings = {
            defaultEdgeLabelColor: '#000',
            defaultEdgeLabelActiveColor: '#000',
            defaultEdgeLabelSize: 10,
            edgeLabelSize: 'fixed',
            edgeLabelSizePowRatio: 1,
            edgeLabelThreshold: 1
          };

          // Export the previously designed settings:
          sigma.settings = sigma.utils.extend(sigma.settings || {}, settings);

          // Override default settings:
          sigma.settings.drawEdgeLabels = true;
        }
      }
    },

    contextState: {
      createEdge: false,
      _from: false,
      _to: false,
      fromX: false,
      fromY: false
    },

    clearOldContextMenu: function (states) {
      var self = this;

      // clear dom
      $('#nodeContextMenu').remove();
      var string = '<div id="nodeContextMenu" class="nodeContextMenu"></div>';
      $('#graph-container').append(string);

      // clear state
      if (states) {
        _.each(this.contextState, function (val, key) {
          self.contextState[key] = false;
        });
      }

      // clear events
      var c = document.getElementsByClassName('sigma-mouse')[0];
      c.removeEventListener('mousemove', self.drawLine.bind(this), false);

      // clear info div
    },

    trackCursorPosition: function (e) {
      this.cursorX = e.x;
      this.cursorY = e.y;
    },

    addNode: function () {
      var self = this;

      var collectionId = $('.modal-body #new-node-collection-attr').val();
      var key = $('.modal-body #new-node-key-attr').last().val();

      var callback = function (error, id) {
        if (error) {
          arangoHelper.arangoError('Error', 'Could not create node');
        } else {
          self.currentGraph.graph.addNode({
            id: id,
            label: self.graphConfig.nodeLabel,
            size: self.graphConfig.nodeSize || Math.random(),
            color: self.graphConfig.nodeColor || '#2ecc71',
            x: self.cursorX,
            y: self.cursorY
          });

          window.modalView.hide();
          // rerender graph
          self.currentGraph.refresh();
        }
      };

      if (key !== '' || key !== undefined) {
        this.documentStore.createTypeDocument(collectionId, key, callback);
      } else {
        this.documentStore.createTypeDocument(collectionId, null, callback);
      }
    },

    addNodeModal: function () {
      if (this.graphSettings.vertexCollections !== 0) {
        var buttons = []; var tableContent = []; var collections = [];

        _.each(this.graphSettings.vertexCollections, function (val) {
          collections.push({
            label: val.name,
            value: val.id
          });
        });

        tableContent.push(
          window.modalView.createTextEntry(
            'new-node-key-attr',
            '_key',
            undefined,
            'The nodes unique key(optional attribute, leave empty for autogenerated key',
            'is optional: leave empty for autogenerated key',
            false,
            [
              {
                rule: Joi.string().allow('').optional(),
                msg: ''
              }
            ]
          )
        );

        tableContent.push(
          window.modalView.createSelectEntry(
            'new-node-collection-attr',
            'Collection',
            undefined,
            'Please select the destination for the new node.',
            collections
          )
        );

        buttons.push(
          window.modalView.createSuccessButton('Create', this.addNode.bind(this))
        );

        window.modalView.show(
          'modalTable.ejs',
          'Create node',
          buttons,
          tableContent
        );
      } else {
        arangoHelper.arangoError('Graph', 'No valid vertex collections found.');
      }
    },

    addEdge: function () {
      var self = this;
      var from = self.contextState._from;
      var to = self.contextState._to;

      var collectionName;
      if ($('.modal-body #new-edge-collection-attr').val() === '') {
        collectionName = $('.modal-body #new-edge-collection-attr').text();
      } else {
        collectionName = $('.modal-body #new-edge-collection-attr').val();
      }
      var key = $('.modal-body #new-edge-key-attr').last().val();

      var callback = function (error, data) {
        if (!error) {
          // success
          self.currentGraph.graph.addEdge({
            source: from,
            target: to,
            id: data._id,
            color: self.graphConfig.edgeColor
          });

          // rerender graph
          self.currentGraph.refresh();
        } else {
          arangoHelper.arangoError('Graph', 'Could not create edge.');
        }

        // then clear states
        self.clearOldContextMenu(true);
        window.modalView.hide();
      };

      if (key !== '' || key !== undefined) {
        this.documentStore.createTypeEdge(collectionName, from, to, key, callback);
      } else {
        this.documentStore.createTypeEdge(collectionName, from, to, null, callback);
      }
    },

    addEdgeModal: function (edgeDefinitions) {
      if (edgeDefinitions !== 0) {
        var buttons = []; var tableContent = [];

        tableContent.push(
          window.modalView.createTextEntry(
            'new-edge-key-attr',
            '_key',
            undefined,
            'The edges unique key(optional attribute, leave empty for autogenerated key',
            'is optional: leave empty for autogenerated key',
            false,
            [
              {
                rule: Joi.string().allow('').optional(),
                msg: ''
              }
            ]
          )
        );

        if (edgeDefinitions.length > 1) {
          var collections = [];

          _.each(edgeDefinitions, function (val) {
            collections.push({
              label: val,
              value: val
            });
          });

          tableContent.push(
            window.modalView.createSelectEntry(
              'new-edge-collection-attr',
              'Edge collection',
              undefined,
              'Please select the destination for the new edge.',
              collections
            )
          );
        } else {
          tableContent.push(
            window.modalView.createReadOnlyEntry(
              'new-edge-collection-attr',
              'Edge collection',
              edgeDefinitions[0],
              'The edges collection to be used.'
            )
          );
        }

        buttons.push(
          window.modalView.createSuccessButton('Create', this.addEdge.bind(this))
        );

        window.modalView.show(
          'modalTable.ejs',
          'Create edge',
          buttons,
          tableContent
        );
      } else {
        arangoHelper.arangoError('Graph', 'No valid edge definitions found.');
      }
    },

    // right click background context menu
    createContextMenu: function (e) {
      var self = this;
      var x = self.cursorX - 50;
      var y = self.cursorY - 50;
      this.clearOldContextMenu();

      var generateMenu = function (e) {
        var hotaru = ['#364C4A', '#497C7F', '#92C5C0', '#858168', '#CCBCA5'];

        var Wheelnav = wheelnav;

        var wheel = new Wheelnav('nodeContextMenu');
        wheel.maxPercent = 1.0;
        wheel.wheelRadius = 50;
        wheel.clockwise = false;
        wheel.colors = hotaru;
        wheel.multiSelect = true;
        wheel.clickModeRotate = false;
        wheel.slicePathFunction = slicePath().DonutSlice;
        if (self.viewStates.captureMode) {
          wheel.createWheel([icon.plus, icon.trash]);
        } else {
          wheel.createWheel([icon.plus, '']);
        }

        wheel.navItems[0].selected = false;
        wheel.navItems[0].hovered = false;
        // add menu events

        // function 0: add node
        wheel.navItems[0].navigateFunction = function (e) {
          self.clearOldContextMenu();
          self.addNodeModal();
        };

        if (self.viewStates.captureMode) {
          // function 1: delete all selected nodes
          wheel.navItems[1].navigateFunction = function (e) {
            self.clearOldContextMenu();
          };
        }

        // deselect active default entry
        wheel.navItems[0].selected = false;
        wheel.navItems[0].hovered = false;
      };

      $('#nodeContextMenu').css('position', 'fixed');
      $('#nodeContextMenu').css('left', x);
      $('#nodeContextMenu').css('top', y);
      $('#nodeContextMenu').width(100);
      $('#nodeContextMenu').height(100);

      generateMenu(e);
    },

    // right click node context menu
    createNodeContextMenu: function (nodeId, e) {
      var self = this;
      var x; var y;

      _.each(e.data.node, function (val, key) {
        if (key.substr(0, 8) === 'renderer' && key.charAt(key.length - 1) === 'x') {
          x = val;
        }
        if (key.substr(0, 8) === 'renderer' && key.charAt(key.length - 1) === 'y') {
          y = val;
        }
      });

      this.clearOldContextMenu();

      var generateMenu = function (e, nodeId) {
        var hotaru = ['#364C4A', '#497C7F', '#92C5C0', '#858168', '#CCBCA5'];

        var Wheelnav = wheelnav;

        var wheel = new Wheelnav('nodeContextMenu');
        wheel.maxPercent = 1.0;
        wheel.wheelRadius = 50;
        wheel.clockwise = false;
        wheel.colors = hotaru;
        wheel.multiSelect = true;
        wheel.clickModeRotate = false;
        wheel.slicePathFunction = slicePath().DonutSlice;
        wheel.createWheel([icon.edit, icon.trash, icon.arrowleft2, icon.connect]);

        wheel.navItems[0].selected = false;
        wheel.navItems[0].hovered = false;
        // add menu events

        // function 0: edit
        wheel.navItems[0].navigateFunction = function (e) {
          self.clearOldContextMenu();
          self.editNode(nodeId);
        };

        // function 1: delete
        wheel.navItems[1].navigateFunction = function (e) {
          self.clearOldContextMenu();
          self.deleteNode(nodeId);
        };

        // function 2: mark as start node
        wheel.navItems[2].navigateFunction = function (e) {
          self.clearOldContextMenu();
          self.setStartNode(nodeId);
        };

        // function 3: create edge
        wheel.navItems[3].navigateFunction = function (e) {
          self.contextState.createEdge = true;
          self.contextState._from = nodeId;
          self.contextState.fromX = x;
          self.contextState.fromY = y;

          var c = document.getElementsByClassName('sigma-mouse')[0];
          c.addEventListener('mousemove', self.drawLine.bind(this), false);

          self.clearOldContextMenu();
        };

        // deselect active default entry
        wheel.navItems[0].selected = false;
        wheel.navItems[0].hovered = false;
      };

      $('#nodeContextMenu').css('left', x + 115);
      $('#nodeContextMenu').css('top', y + 72);
      $('#nodeContextMenu').width(100);
      $('#nodeContextMenu').height(100);

      generateMenu(e, nodeId);
    },

    clearMouseCanvas: function () {
      var c = document.getElementsByClassName('sigma-mouse')[0];
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, $(c).width(), $(c).height());
    },

    drawLine: function (e) {
      var context = window.App.graphViewer2.contextState;

      if (context.createEdge) {
        var fromX = context.fromX;
        var fromY = context.fromY;
        var toX = e.offsetX;
        var toY = e.offsetY;

        var c = document.getElementsByClassName('sigma-mouse')[0];
        var ctx = c.getContext('2d');
        ctx.clearRect(0, 0, $(c).width(), $(c).height());
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
      }
    },

    getGraphSettings: function (callback) {
      var self = this;
      var combinedName = window.App.currentDB.toJSON().name + '_' + this.name;

      this.userConfig.fetch({
        success: function (data) {
          self.graphConfig = data.toJSON().graphs[combinedName];

          // init settings view
          if (self.graphSettingsView) {
            self.graphSettingsView.remove();
          }
          self.graphSettingsView = new window.GraphSettingsView({
            name: self.name,
            userConfig: self.userConfig,
            saveCallback: self.render
          });
          self.graphSettingsView.render();

          if (callback) {
            callback(self.graphConfig);
          }
        }
      });
    },

    editNode: function (id) {
      var callback = function () {};

      arangoHelper.openDocEditor(id, 'doc', callback);
    },

    reloadGraph: function () {
      Backbone.history.loadUrl(Backbone.history.fragment);
    },

    getEdgeDefinitionCollections: function (fromCollection, toCollection) {
      var array = [];

      _.each(this.model.edgeDefinitions, function (edgeDefinition) {
        _.each(edgeDefinition.from, function (from) {
          if (from === fromCollection) {
            _.each(edgeDefinition.to, function (to) {
              if (to === toCollection) {
                array.push(edgeDefinition.collection);
              }
            });
          }
        });
      });

      return array;
    },

    renderGraph: function (graph, toFocus) {
      var self = this;

      this.graphSettings = graph.settings;

      if (graph.edges.length === 0) {
        var string = 'No edges found for starting point: <span style="font-weight: 400">' + self.graphSettings.startVertex._id + '</span>';
        arangoHelper.arangoError('Graph', string);
        $('#calculatingGraph').html(
          '<div style="font-weight: 300; font-size: 10.5pt"><span style="font-weight: 400">Stopped. </span></br></br>' +
          string +
          '. Please <a style="color: #3498db" href="' + window.location.href +
          '/settings">choose a different start node </a>or try to reload the graph. ' +
          '<i id="reloadGraph" class="fa fa-refresh" style="cursor: pointer"></i></div>'
        );
        return;
      }
      this.Sigma = sigma;

      // defaults
      var algorithm = 'noverlap';
      var renderer = 'canvas';

      if (this.graphConfig) {
        if (this.graphConfig.layout) {
          algorithm = this.graphConfig.layout;
        }

        if (this.graphConfig.renderer) {
          renderer = this.graphConfig.renderer;

          if (renderer === 'canvas') {
            self.isEditable = true;
          }
        }
      }

      var settings = {
        doubleClickEnabled: false,
        minNodeSize: 3.5,
        minEdgeSize: 1,
        maxEdgeSize: 4,
        enableEdgeHovering: true,
        edgeHoverColor: '#000',
        defaultEdgeHoverColor: '#000',
        defaultEdgeType: 'line',
        edgeHoverSizeRatio: 2,
        edgeHoverExtremities: true
      };

      if (this.graphConfig) {
        if (this.graphConfig.edgeType) {
          settings.defaultEdgeType = this.graphConfig.edgeType;
        }
      }

      // adjust display settings for big graphs
      if (graph.nodes.length > 500) {
        // show node label if size is 15
        settings.labelThreshold = 15;
        settings.hideEdgesOnMove = true;
      }

      // adjust display settings for webgl renderer
      if (renderer === 'webgl') {
        settings.enableEdgeHovering = false;
      }

      // create sigma graph
      var s = new this.Sigma({
        graph: graph,
        container: 'graph-container',
        renderer: {
          container: document.getElementById('graph-container'),
          type: renderer
        },
        settings: settings
      });
      this.currentGraph = s;

      sigma.plugins.fullScreen({
        container: 'graph-container',
        btnId: 'graph-fullscreen-btn'
      });

      if (algorithm === 'noverlap') {
        var noverlapListener = s.configNoverlap({
          nodeMargin: 0.1,
          scaleNodes: 1.05,
          gridSize: 75,
          easing: 'quadraticInOut', // animation transition function
          duration: 10000 // animation duration. Long here for the purposes of this example only
        });

        noverlapListener.bind('start stop interpolate', function (e) {
          if (e.type === 'start') {
          }
          if (e.type === 'interpolate') {
          }
        });
      } else if (algorithm === 'fruchtermann') {
        var frListener = sigma.layouts.fruchtermanReingold.configure(s, {
          iterations: 500,
          easing: 'quadraticInOut',
          duration: 800
        });

        frListener.bind('start stop interpolate', function (e) {});
      }

      s.graph.nodes().forEach(function (n) {
        n.originalColor = n.color;
      });
      s.graph.edges().forEach(function (e) {
        e.originalColor = e.color;
      });

      // for canvas renderer allow graph editing
      if (renderer === 'canvas') {
        s.bind('rightClickStage', function (e) {
          self.createContextMenu(e);
          self.clearMouseCanvas();
        });

        s.bind('clickNode', function (e) {
          if (self.contextState.createEdge === true) {
            // create the edge
            self.contextState._to = e.data.node.id;
            var fromCollection = self.contextState._from.split('/')[0];
            var toCollection = self.contextState._to.split('/')[0];

            // validate edgeDefinitions
            var foundEdgeDefinitions = self.getEdgeDefinitionCollections(fromCollection, toCollection);
            self.addEdgeModal(foundEdgeDefinitions, self.contextState._from, self.contextState._to);
          }
        });

        s.bind('rightClickNode', function (e) {
          var nodeId = e.data.node.id;
          self.createNodeContextMenu(nodeId, e);
        });

        s.bind('doubleClickNode', function (e) {
          var nodeId = e.data.node.id;
          var toKeep = s.graph.neighbors(nodeId);
          toKeep[nodeId] = e.data.node;

          s.graph.nodes().forEach(function (n) {
            if (toKeep[n.id]) {
              n.color = n.originalColor;
            } else {
              n.color = '#eee';
            }
          });

          s.graph.edges().forEach(function (e) {
            if (toKeep[e.source] && toKeep[e.target]) {
              e.color = 'rgb(64, 74, 83)';
            } else {
              e.color = '#eee';
            }
          });

          s.refresh();
        });

        s.bind('doubleClickStage', function () {
          s.graph.nodes().forEach(function (n) {
            n.color = n.originalColor;
          });

          s.graph.edges().forEach(function (e) {
            e.color = e.originalColor;
          });

          s.refresh();
        });

        s.bind('clickStage', function () {
          self.clearOldContextMenu(true);
          self.clearMouseCanvas();
        });
      }

      var dragListener;
      // Initialize the dragNodes plugin:
      if (algorithm === 'noverlap') {
        s.startNoverlap();
        // allow draggin nodes
        dragListener = sigma.plugins.dragNodes(s, s.renderers[0]);
      } else if (algorithm === 'force') {
        s.startForceAtlas2({worker: true, barnesHutOptimize: false});

        var duration = 3000;

        if (graph.nodes.length > 2500) {
          duration = 5000;
        } else if (graph.nodes.length < 50) {
          duration = 500;
        }

        window.setTimeout(function () {
          s.stopForceAtlas2();
          dragListener = sigma.plugins.dragNodes(s, s.renderers[0]);
        }, duration);
      } else if (algorithm === 'fruchtermann') {
        // Start the Fruchterman-Reingold algorithm:
        sigma.layouts.fruchtermanReingold.start(s);
        dragListener = sigma.plugins.dragNodes(s, s.renderers[0]);
      } else {
        dragListener = sigma.plugins.dragNodes(s, s.renderers[0]);
      }
      console.log(dragListener);

      // add listener to keep track of cursor position
      var c = document.getElementsByClassName('sigma-mouse')[0];
      c.addEventListener('mousemove', self.trackCursorPosition.bind(this), false);

      // focus last input box if available
      if (toFocus) {
        $('#' + toFocus).focus();
      }
      // clear up info div
      $('#calculatingGraph').remove();
    }

  });
}());
