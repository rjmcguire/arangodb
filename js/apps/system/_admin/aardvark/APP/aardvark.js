/* global AQL_EXECUTE */

'use strict';

// //////////////////////////////////////////////////////////////////////////////
// DISCLAIMER
//
// Copyright 2010-2013 triAGENS GmbH, Cologne, Germany
// Copyright 2016 ArangoDB GmbH, Cologne, Germany
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Copyright holder is ArangoDB GmbH, Cologne, Germany
//
// @author Michael Hackstein
// @author Heiko Kernbach
// @author Alan Plum
// //////////////////////////////////////////////////////////////////////////////

const joi = require('joi');
const dd = require('dedent');
const internal = require('internal');
const db = require('@arangodb').db;
const errors = require('@arangodb').errors;
const notifications = require('@arangodb/configuration').notifications;
const examples = require('@arangodb/graph-examples/example-graph');
const createRouter = require('@arangodb/foxx/router');
const users = require('@arangodb/users');
const cluster = require('@arangodb/cluster');

const ERROR_USER_NOT_FOUND = errors.ERROR_USER_NOT_FOUND.code;
const API_DOCS = require(module.context.fileName('api-docs.json'));
API_DOCS.basePath = `/_db/${encodeURIComponent(db._name())}`;

const router = createRouter();
module.exports = router;

router.get('/config.js', function (req, res) {
  const scriptName = req.get('x-script-name');
  const basePath = req.trustProxy && scriptName || '';
  res.send(
    `var frontendConfig = ${JSON.stringify({
      basePath: basePath,
      db: req.database,
      authenticationEnabled: internal.authenticationEnabled(),
      isCluster: cluster.isCluster()
    })}`
  );
})
.response(['text/javascript']);

router.get('/whoAmI', function (req, res) {
  res.json({user: req.arangoUser || null});
})
.summary('Return the current user')
.description(dd`
  Returns the current user or "null" if the user is not authenticated.
  Returns "false" if authentication is disabled.
`);

const authRouter = createRouter();
router.use(authRouter);

authRouter.use((req, res, next) => {
  if (internal.authenticationEnabled()) {
    if (!req.arangoUser) {
      res.throw('unauthorized');
    }
  }
  next();
});

router.get('/api/*', module.context.apiDocumentation({
  swaggerJson (req, res) {
    res.json(API_DOCS);
  }
}))
.summary('System API documentation')
.description(dd`
  Mounts the system API documentation.
`);

authRouter.get('shouldCheckVersion', function (req, res) {
  const versions = notifications.versions();
  res.json(Boolean(versions && versions.enableVersionNotification));
})
.summary('Is version check allowed')
.description(dd`
  Check if version check is allowed.
`);

authRouter.post('disableVersionCheck', function (req, res) {
  notifications.setVersions({enableVersionNotification: false});
  res.json('ok');
})
.summary('Disable version check')
.description(dd`
  Disable the version check in web interface
`);

authRouter.post('/query/explain', function (req, res) {
  const bindVars = req.body.bindVars;
  const query = req.body.query;
  const id = req.body.id;
  const batchSize = req.body.batchSize;
  let msg = null;

  try {
    if (bindVars) {
      msg = require('@arangodb/aql/explainer').explain({
        query: query,
        bindVars: bindVars,
        batchSize: batchSize,
        id: id
      }, {colors: false}, false, bindVars);
    } else {
      msg = require('@arangodb/aql/explainer').explain(query, {colors: false}, false);
    }
  } catch (e) {
    res.throw('bad request', e.message, {cause: e});
  }

  res.json({msg});
})
.body(joi.object({
  query: joi.string().required(),
  bindVars: joi.object().optional(),
  batchSize: joi.number().optional(),
  id: joi.string().optional()
}).required(), 'Query and bindVars to explain.')
.summary('Explains a query')
.description(dd`
  Explains a query in a more user-friendly way than the query_api/explain
`);

authRouter.post('/query/upload/:user', function (req, res) {
  let user = req.pathParams.user;

  try {
    user = users.document(user);
  } catch (e) {
    if (!e.isArangoError || e.errorNum !== ERROR_USER_NOT_FOUND) {
      throw e;
    }
    res.throw('not found');
  }

  if (!user.extra.queries) {
    user.extra.queries = [];
  }

  const existingQueries = user.extra.queries
  .map(query => query.name);

  for (const query of req.body) {
    if (existingQueries.indexOf(query.name) === -1) {
      existingQueries.push(query.name);
      user.extra.queries.push(query);
    }
  }

  users.update(user.user, undefined, undefined, user.extra);
  res.json(user.extra.queries);
})
.pathParam('user', joi.string().required(), 'Username. Ignored if authentication is enabled.')
.body(joi.array().items(joi.object({
  name: joi.string().required(),
  parameter: joi.any().optional(),
  value: joi.any().optional()
}).required()).required(), 'User query array to import.')
.error('not found', 'User does not exist.')
.summary('Upload user queries')
.description(dd`
  This function uploads all given user queries.
`);

authRouter.get('/query/download/:user', function (req, res) {
  let user = req.pathParams.user;

  try {
    user = users.document(user);
  } catch (e) {
    if (!e.isArangoError || e.errorNum !== ERROR_USER_NOT_FOUND) {
      throw e;
    }
    res.throw('not found');
  }

  res.attachment(`queries-${db._name()}-${user.user}.json`);
  res.json(user.extra.queries || []);
})
.pathParam('user', joi.string().required(), 'Username. Ignored if authentication is enabled.')
.error('not found', 'User does not exist.')
.summary('Download stored queries')
.description(dd`
  Download and export all queries from the given username.
`);

authRouter.get('/query/result/download/:query', function (req, res) {
  let query;
  try {
    query = internal.base64Decode(req.pathParams.query);
    query = JSON.parse(query);
  } catch (e) {
    res.throw('bad request', e.message, {cause: e});
  }

  const result = db._query(query.query, query.bindVars).toArray();
  res.attachment(`results-${db._name()}.json`);
  res.json(result);
})
.pathParam('query', joi.string().required(), 'Base64 encoded query.')
.error('bad request', 'The query is invalid or malformed.')
.summary('Download the result of a query')
.description(dd`
  This function downloads the result of a user query.
`);

authRouter.post('/graph-examples/create/:name', function (req, res) {
  const name = req.pathParams.name;

  if (['knows_graph', 'social', 'routeplanner'].indexOf(name) === -1) {
    res.throw('not found');
  }

  const g = examples.loadGraph(name);
  res.json({error: !g});
})
.pathParam('name', joi.string().required(), 'Name of the example graph.')
.summary('Create example graphs')
.description(dd`
  Create one of the given example graphs.
`);

authRouter.post('/job', function (req, res) {
  db._frontend.save(Object.assign(req.body, {model: 'job'}));
  res.json(true);
})
.body(joi.object({
  id: joi.any().required(),
  collection: joi.any().required(),
  type: joi.any().required(),
  desc: joi.any().required()
}).required())
.summary('Store job id of a running job')
.description(dd`
  Create a new job id entry in a specific system database with a given id.
`);

authRouter.delete('/job', function (req, res) {
  db._frontend.removeByExample({model: 'job'}, false);
  res.json(true);
})
.summary('Delete all jobs')
.description(dd`
  Delete all jobs in a specific system database with a given id.
`);

authRouter.delete('/job/:id', function (req, res) {
  db._frontend.removeByExample({id: req.pathParams.id}, false);
  res.json(true);
})
.summary('Delete a job id')
.description(dd`
  Delete an existing job id entry in a specific system database with a given id.
`);

authRouter.get('/job', function (req, res) {
  const result = db._frontend.all().toArray();
  res.json(result);
})
.summary('Return all job ids.')
.description(dd`
  This function returns the job ids of all currently running jobs.
`);

authRouter.get('/graph/:name', function (req, res) {
  var _ = require('lodash');
  var name = req.pathParams.name;
  var gm = require('@arangodb/general-graph');
  var colors = {
    default: [
      '#68BDF6',
      '#6DCE9E',
      '#FF756E',
      '#DE9BF9',
      '#FB95AF',
      '#FFD86E',
      '#A5ABB6'
    ],
    highContrast: [
      '#EACD3F',
      '#6F308A',
      '#DA6927',
      '#98CDE5',
      '#B81F34',
      '#C0BC82',
      '#7F7E80',
      '#61A547',
      '#60A446',
      '#D285B0',
      '#4477B3',
      '#DD8465',
      '#473896',
      '#E0A02F',
      '#8F2689',
      '#E7E655',
      '#7C1514',
      '#93AD3C',
      '#6D3312',
      '#D02C26',
      '#2A3415'
    ]
  };
  // var traversal = require("@arangodb/graph/traversal");

  var graph = gm._graph(name);

  var verticesCollections = graph._vertexCollections();
  var vertexName = verticesCollections[Math.floor(Math.random() * verticesCollections.length)].name();

  var vertexCollections = [];
  _.each(graph._vertexCollections(), function (vertex) {
    vertexCollections.push({
      name: vertex.name(),
      id: vertex._id
    });
  });

  var startVertex;
  var config;

  try {
    config = req.queryParams;
  } catch (e) {
    res.throw('bad request', e.message, {cause: e});
  }

  if (config.nodeStart) {
    try {
      startVertex = db._document(config.nodeStart);
    } catch (e) {
      res.throw('bad request', e.message, {cause: e});
    }

    if (!startVertex) {
      startVertex = db[vertexName].any();
    }
  } else {
    startVertex = db[vertexName].any();
  }

  var toReturn;
  if (startVertex === null) {
    toReturn = {
      empty: true,
      msg: 'Your graph is empty',
      settings: {
        vertexCollections: vertexCollections
      }
    };
  } else {
    var aqlQuery;
    if (config.query) {
      aqlQuery = config.query;
    } else {
      aqlQuery =
       'FOR v, e, p IN 1..' + (config.depth || '2') + ' ANY "' + startVertex._id + '" GRAPH "' + name + '"' +
       'RETURN p'
      ;
    }

    var getAttributeByKey = function (o, s) {
      s = s.replace(/\[(\w+)\]/g, '.$1');
      s = s.replace(/^\./, '');
      var a = s.split('.');
      for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        if (k in o) {
          o = o[k];
        } else {
          return;
        }
      }
      return o;
    };

    var cursor = AQL_EXECUTE(aqlQuery);

    var nodesObj = {};
    var nodesArr = [];
    var nodeNames = {};
    var edgesObj = {};
    var edgesArr = [];

    var tmpObjEdges = {};
    var tmpObjNodes = {};

    _.each(cursor.json, function (obj) {
      var edgeLabel;
      var edgeObj;

      _.each(obj.edges, function (edge) {
        if (edge._to && edge._from) {
          if (config.edgeLabelByCollection === 'true') {
            edgeLabel = edge._id.split('/')[0];
          } else if (config.edgeLabel) {
            // configure edge labels

            if (config.edgeLabel.indexOf('.') > -1) {
              edgeLabel = getAttributeByKey(edge, config.edgeLabel);
              if (nodeLabel === undefined || nodeLabel === '') {
                edgeLabel = edgeLabel._id;
              }
            } else {
              edgeLabel = edge[config.edgeLabel];
            }

            if (typeof edgeLabel !== 'string') {
              edgeLabel = JSON.stringify(edgeLabel);
            }

            if (!edgeLabel) {
              edgeLabel = 'attribute ' + config.edgeLabel + ' not found';
            }
          }

          edgeObj = {
            id: edge._id,
            source: edge._from,
            label: edgeLabel,
            color: config.edgeColor || '#cccccc',
            target: edge._to
          };

          if (config.edgeEditable === 'true') {
            edgeObj.size = 1;
          }

          if (config.edgeColorByCollection === 'true') {
            var coll = edge._id.split('/')[0];
            if (tmpObjEdges.hasOwnProperty(coll)) {
              edgeObj.color = tmpObjEdges[coll];
            } else {
              tmpObjEdges[coll] = colors.default[Object.keys(tmpObjEdges).length];
              edgeObj.color = tmpObjEdges[coll];
            }
          } else if (config.edgeColorAttribute !== '') {
            var attr = edge[config.edgeColorAttribute];
            if (attr) {
              if (tmpObjEdges.hasOwnProperty(attr)) {
                edgeObj.color = tmpObjEdges[attr];
              } else {
                tmpObjEdges[attr] = colors.default[Object.keys(tmpObjEdges).length];
                edgeObj.color = tmpObjEdges[attr];
              }
            }
          }
        }
        edgesObj[edge._id] = edgeObj;
      });

      var nodeLabel;
      var nodeSize;
      var nodeObj;
      _.each(obj.vertices, function (node) {
        if (node !== null) {
          nodeNames[node._id] = true;
          if (config.nodeLabelByCollection === 'true') {
            nodeLabel = node._id.split('/')[0];
          } else if (config.nodeLabel) {
            if (config.nodeLabel.indexOf('.') > -1) {
              nodeLabel = getAttributeByKey(node, config.nodeLabel);
              if (nodeLabel === undefined || nodeLabel === '') {
                nodeLabel = node._id;
              }
            } else {
              nodeLabel = node[config.nodeLabel];
            }
          } else {
            nodeLabel = node._id;
          }

          if (typeof nodeLabel === 'number') {
            nodeLabel = JSON.stringify(nodeLabel);
          }

          if (config.nodeSize) {
            nodeSize = node[config.nodeSize];
          }

          nodeObj = {
            id: node._id,
            label: nodeLabel,
            size: nodeSize || 10,
            color: config.nodeColor || '#2ecc71',
            x: Math.random(),
            y: Math.random()
          };

          if (config.nodeColorByCollection === 'true') {
            var coll = node._id.split('/')[0];
            if (tmpObjNodes.hasOwnProperty(coll)) {
              nodeObj.color = tmpObjNodes[coll];
            } else {
              tmpObjNodes[coll] = colors.default[Object.keys(tmpObjNodes).length];
              nodeObj.color = tmpObjNodes[coll];
            }
          } else if (config.nodeColorAttribute !== '') {
            var attr = node[config.nodeColorAttribute];
            if (attr) {
              if (tmpObjNodes.hasOwnProperty(attr)) {
                nodeObj.color = tmpObjNodes[attr];
              } else {
                tmpObjNodes[attr] = colors.default[Object.keys(tmpObjNodes).length];
                nodeObj.color = tmpObjNodes[attr];
              }
            }
          }

          nodesObj[node._id] = nodeObj;
        }
      });
    });

    _.each(nodesObj, function (node) {
      nodesArr.push(node);
    });

    var nodeNamesArr = [];
    _.each(nodeNames, function (found, key) {
      nodeNamesArr.push(key);
    });

    // array format for sigma.js
    _.each(edgesObj, function (edge) {
      if (nodeNamesArr.indexOf(edge.source) > -1 && nodeNamesArr.indexOf(edge.target) > -1) {
        edgesArr.push(edge);
      }
    });
    toReturn = {
      nodes: nodesArr,
      edges: edgesArr,
      settings: {
        vertexCollections: vertexCollections,
        startVertex: startVertex
      }
    };
  }

  res.json(toReturn);
})
.summary('Return vertices and edges of a graph.')
.description(dd`
  This function returns vertices and edges for a specific graph.
`);

