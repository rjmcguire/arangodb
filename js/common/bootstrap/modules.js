/*jslint indent: 2, nomen: true, maxlen: 100, sloppy: true, vars: true, white: true, plusplus: true */
/*global require, module: true */

////////////////////////////////////////////////////////////////////////////////
/// @brief JavaScript server functions
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2010-2011 triagens GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is triAGENS GmbH, Cologne, Germany
///
/// @author Dr. Frank Celler
/// @author Copyright 2011, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                      constructors and destructors
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @addtogroup V8Module
/// @{
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
/// @brief module constructor
////////////////////////////////////////////////////////////////////////////////

function Module (id) {
  this.id = id;
  this.exports = {};
}

////////////////////////////////////////////////////////////////////////////////
/// @}
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                                 private variables
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @addtogroup V8Module
/// @{
////////////////////////////////////////////////////////////////////////////////

(function () {

////////////////////////////////////////////////////////////////////////////////
/// @brief module cache
////////////////////////////////////////////////////////////////////////////////

  var ModuleCache = {};

  ModuleCache["/"] = new Module("/");
  ModuleCache["/internal"] = new Module("/internal");
  ModuleCache["/fs"] = new Module("/fs");
  ModuleCache["/console"] = new Module("/console");

////////////////////////////////////////////////////////////////////////////////
/// @brief file exists cache
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.ModuleExistsCache = {};

////////////////////////////////////////////////////////////////////////////////
/// @brief top-level-module
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.root = ModuleCache["/"];

////////////////////////////////////////////////////////////////////////////////
/// @}
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                                   private methods
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @addtogroup V8Module
/// @{
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
/// @brief loads a file and creates a new module descriptor
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.require = function (path) {
    var internal;
    var content;
    var f;
    var module;
    var paths;
    var raw;
    var sandbox;

    internal = ModuleCache["/internal"].exports;

    // first get rid of any ".." and "."
    path = this.normalise(path);

    // check if you already know the module, return the exports
    if (ModuleCache.hasOwnProperty(path)) {
      return ModuleCache[path].exports;
    }

    // locate file and read content
    raw = internal.loadDatabaseFile(path);

    // test for parse errors first and fail early if a parse error detected
    if (! internal.parse(raw.content, path)) {
      throw "Javascript parse error in file '" + path + "'";
    }

    // create a new sandbox and execute
    module = ModuleCache[path] = new Module(path);

    content = "(function (module, exports, require, print) {"
            + raw.content 
            + "\n});";

    f = internal.execute(content, undefined, path);

    if (f === undefined) {
      throw "cannot create context function";
    }

    try {
      f(module,
        module.exports,
        function(path) { return module.require(path); },
        ModuleCache["/internal"].exports.print);
    }
    catch (err) {
      delete ModuleCache[path];
      throw "Javascript exception in file '" + path + "': " + err.stack;
    }

    return module.exports;
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief returns true if require found a file
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.exists = function (path) {
    return this.ModuleExistsCache[path];
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief normalises a path
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.normalise = function (path) {
    var i;
    var n;
    var p;
    var q;
    var x;

    if (path === "") {
      return this.id;
    }

    p = path.split('/');

    // relative path
    if (p[0] === "." || p[0] === "..") {
      q = this.id.split('/');
      q.pop();
      q = q.concat(p);
    }

    // absolute path
    else {
      q = p;
    }

    // normalize path
    n = [];

    for (i = 0;  i < q.length;  ++i) {
      x = q[i];

      if (x === "..") {
        if (n.length === 0) {
          throw "cannot cross module top";
        }

        n.pop();
      }
      else if (x !== "" && x !== ".") {
        n.push(x);
      }
    }

    return "/" + n.join('/');
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief unloads module
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.unload = function (path) {
    if (! path) {
      return;
    }

    var norm = module.normalise(path);

    if (   norm === "/"
        || norm === "/console"
        || norm === "/fs"
        || norm === "/internal"
        || norm === "/org/arangodb"
        || norm === "/org/arangodb/actions"
        || norm === "/org/arangodb/arango-collection"
        || norm === "/org/arangodb/arango-database"
        || norm === "/org/arangodb/arango-error"
        || norm === "/org/arangodb/arango-statement"
        || norm === "/org/arangodb/shaped-json") {
      return;
    }

    delete ModuleCache[norm];
  };

////////////////////////////////////////////////////////////////////////////////
/// @brief unloads module
////////////////////////////////////////////////////////////////////////////////

  Module.prototype.unloadAll = function () {
    var path;

    for (path in ModuleCache) {
      if (ModuleCache.hasOwnProperty(path)) {
        this.unload(path);
      }
    }
  };

////////////////////////////////////////////////////////////////////////////////
/// @}
////////////////////////////////////////////////////////////////////////////////

}());

// -----------------------------------------------------------------------------
// --SECTION--                                                  global variables
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @addtogroup V8Module
/// @{
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
/// @brief top-level module
////////////////////////////////////////////////////////////////////////////////

module = Module.prototype.root;

////////////////////////////////////////////////////////////////////////////////
/// @}
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                                  global functions
// -----------------------------------------------------------------------------

////////////////////////////////////////////////////////////////////////////////
/// @addtogroup V8Module
/// @{
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
/// @brief global require function
///
/// @FUN{require(@FA{path})}
///
/// @FN{require} checks if the file specified by @FA{path} has already been
/// loaded.  If not, the content of the file is executed in a new
/// context. Within the context you can use the global variable @LIT{exports}
/// in order to export variables and functions. This variable is returned by
/// @FN{require}.
///
/// Assume that your module file is @LIT{test1.js} and contains
///
/// @verbinclude modules-require-1
///
/// Then you can use @FN{require} to load the file and access the exports.
///
/// @verbinclude modules-require-2
///
/// @FN{require} follows the specification
/// <a href="http://wiki.commonjs.org/wiki/Modules/1.1.1">Modules/1.1.1</a>.
////////////////////////////////////////////////////////////////////////////////

function require (path) {
  return module.require(path);
}

////////////////////////////////////////////////////////////////////////////////
/// @brief global print function
////////////////////////////////////////////////////////////////////////////////

function print () {
  var internal = require("internal");
  internal.print.apply(internal.print, arguments);
}

////////////////////////////////////////////////////////////////////////////////
/// @brief turn off pretty printing
////////////////////////////////////////////////////////////////////////////////

function print_plain () {
  var internal = require("internal");

  var p = internal.PRETTY_PRINT;
  internal.PRETTY_PRINT = false;

  var c = internal.COLOR_OUTPUT;
  internal.COLOR_OUTPUT = false;
  
  try {
    internal.print.apply(internal.print, arguments);

    internal.PRETTY_PRINT = p;
    internal.COLOR_OUTPUT = c;
  }
  catch (e) {
    internal.PRETTY_PRINT = p;
    internal.COLOR_OUTPUT = c;

    throw e.message;    
  }  
}

////////////////////////////////////////////////////////////////////////////////
/// @brief start pretty printing
////////////////////////////////////////////////////////////////////////////////

function start_pretty_print () {
  require("internal").startPrettyPrint();
}

////////////////////////////////////////////////////////////////////////////////
/// @brief stop pretty printing
////////////////////////////////////////////////////////////////////////////////

function stop_pretty_print () {
  require("internal").stopPrettyPrint();
}

////////////////////////////////////////////////////////////////////////////////
/// @}
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

// Local Variables:
// mode: outline-minor
// outline-regexp: "^\\(/// @brief\\|/// @addtogroup\\|// --SECTION--\\|/// @page\\|/// @}\\)"
// End:
