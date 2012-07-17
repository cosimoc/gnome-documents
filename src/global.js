/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Manager = imports.manager;
const OffsetController = imports.offsetController;
const Query = imports.query;
const Searchbar = imports.searchbar;
const Sources = imports.sources;
const TrackerController = imports.trackerController;

let application = null;
let collectionManager = null;
let connection = null;
let connectionQueue = null;
let documentManager = null;
let goaClient = null;
let modeController = null;
let notificationManager = null;
let offsetController = null;
let queryBuilder = null;
let searchCategoryManager = null;
let searchController = null;
let searchMatchManager = null;
let searchTypeManager = null;
let selectionController = null;
let settings = null;
let sourceManager = null;
let trackerController = null;

function initSearch() {
    sourceManager = new Sources.SourceManager();
    collectionManager = new Manager.BaseManager();

    searchCategoryManager = new Searchbar.SearchCategoryManager();
    searchMatchManager = new Searchbar.SearchMatchManager();
    searchTypeManager = new Searchbar.SearchTypeManager();
    searchController = new Searchbar.SearchController();

    offsetController = new OffsetController.OffsetController();
    queryBuilder = new Query.QueryBuilder();
    connectionQueue = new TrackerController.TrackerConnectionQueue();
}
