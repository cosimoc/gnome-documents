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

const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const GData = imports.gi.GData;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const ChangeMonitor = imports.changeMonitor;
const Global = imports.global;
const Manager = imports.manager;
const Path = imports.path;
const Query = imports.query;
const Searchbar = imports.searchbar;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;

function SingleItemJob(doc) {
    this._init(doc);
}

SingleItemJob.prototype = {
    _init: function(urn) {
        this._urn = urn;
        this._cursor = null;
    },

    run: function(flags, callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildSingleQuery(this._urn, flags);
        Global.connectionQueue.add(query.sparql, null, Lang.bind(this,
            function(object, res) {
                try {
                    let cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log('Unable to query single item ' + e.toString());
                    this._emitCallback();
                }
            }));
    },

    _onCursorNext: function(cursor, res) {
        let valid = false;

        try {
            valid = cursor.next_finish(res);
        } catch (e) {
            log('Unable to query single item ' + e.toString());
        }

        if (!valid) {
            cursor.close();
            this._emitCallback();

            return;
        }

        this._cursor = cursor;
        this._emitCallback();
        cursor.close();
    },

    _emitCallback: function() {
        this._callback(this._cursor);
    }
};

function DeleteItemJob(urn) {
    this._init(urn);
}

// deletes the given resource
DeleteItemJob.prototype = {
    _init: function(urn) {
        this._urn = urn;
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildDeleteResourceQuery(this._urn);
        Global.connectionQueue.update(query.sparql, null, Lang.bind(this,
            function(object, res) {
                try {
                    object.update_finish(res);
                } catch (e) {
                    log(e);
                }

                if (this._callback)
                    this._callback();
            }));
    }
};

function CollectionIconWatcher(collection) {
    this._init(collection);
}

CollectionIconWatcher.prototype = {
    _init: function(collection) {
        this._collection = collection;
        this._pixbuf = null;

        this._start();
    },

    _clear: function() {
        this._docConnections = {};
        this._urns = [];
        this._docs = [];
    },

    _start: function() {
        this._clear();

        let query = Global.queryBuilder.buildCollectionIconQuery(this._collection.id);
        Global.connectionQueue.add(query.sparql, null, Lang.bind(this,
            function(object, res) {
                let cursor = null;
                try {
                    cursor = object.query_finish(res);
                } catch (e) {
                    log('Unable to query collection items ' + e.toString());
                    return;
                }

                cursor.next_async(null, Lang.bind(this, this._onCursorNext));
            }));
    },

    _onCursorNext: function(cursor, res) {
        let valid = false;

        try {
            valid = cursor.next_finish(res);
        } catch (e) {
            log('Unable to query collection items ' + e.toString());
            cursor.close();
            return;
        }

        if (!valid) {
            cursor.close();
            this._onCollectionIconFinished();

            return;
        }

        let urn = cursor.get_string(0)[0];
        this._urns.push(urn);

        cursor.next_async(null, Lang.bind(this, this._onCursorNext));
    },

    _onCollectionIconFinished: function() {
        if (!this._urns.length)
            return;

        // now this._urns has all the URNs of items contained in the collection
        let toQuery = [];

        this._urns.forEach(Lang.bind(this,
            function(urn) {
                let doc = Global.documentManager.getItemById(urn);
                if (doc)
                    this._docs.push(doc);
                else
                    toQuery.push(urn);
            }));

        this._toQueryRemaining = toQuery.length;
        if (!this._toQueryRemaining) {
            this._allDocsReady();
            return;
        }

        toQuery.forEach(Lang.bind(this,
            function(urn) {
                let job = new SingleItemJob(urn);
                job.run(Query.QueryFlags.UNFILTERED, Lang.bind(this,
                    function(cursor) {
                        if (cursor) {
                            let doc = Global.documentManager.createDocumentFromCursor(cursor);
                            this._docs.push(doc);
                        }

                        this._toQueryCollector();
                    }));
            }));
    },

    _toQueryCollector: function() {
        this._toQueryRemaining--;

        if (!this._toQueryRemaining)
            this._allDocsReady();
    },

    _allDocsReady: function() {
        this._docs.forEach(Lang.bind(this,
            function(doc) {
                let updateId = doc.connect('info-updated',
                                           Lang.bind(this, this._createCollectionIcon));
                this._docConnections[updateId] = doc;
            }));

        this._createCollectionIcon();
    },

    _createCollectionIcon: function() {
        // now this._docs has an array of Document objects from which we will create the
        // collection icon
        let pixbufs = [];

        this._docs.forEach(
            function(doc) {
                pixbufs.push(doc.pristinePixbuf);
            });

        this._pixbuf = Gd.create_collection_icon(Utils.getIconSize(), pixbufs);
        this._emitRefresh();
    },

    _emitRefresh: function() {
        this.emit('icon-updated', this._pixbuf);
    },

    destroy: function() {
        for (id in this._docConnections) {
            let doc = this._docConnections[id];
            doc.disconnect(id);
        }
    },

    refresh: function() {
        this.destroy();
        this._start();
    }
};
Signals.addSignalMethods(CollectionIconWatcher.prototype);

function DocCommon(cursor) {
    this._init(cursor);
}

DocCommon.prototype = {
    _init: function(cursor) {
        this.id = null;
        this.uri = null;
        this.name = null;
        this.author = null;
        this.mtime = null;
        this.resourceUrn = null;
        this.favorite = null;
        this.pixbuf = null;
        this.pristinePixbuf = null;
        this.defaultAppName = null;

        this.mimeType = null;
        this.rdfType = null;
        this.typeDescription = null;
        this.sourceName = null;

        this.favorite = false;
        this.shared = false;

        this.collection = false;
        this._collectionIconWatcher = null;

        this.thumbnailed = false;
        this._thumbPath = null;

        this.populateFromCursor(cursor);

        this._refreshIconId =
            Global.settings.connect('changed::view-as',
                                    Lang.bind(this, this.refreshIcon));
        this._filterId =
            Global.searchCategoryManager.connect('active-changed',
                                                 Lang.bind(this, this.refreshIcon));
    },

    refresh: function() {
        let job = new SingleItemJob(this.id);
        job.run(Query.QueryFlags.NONE, Lang.bind(this,
            function(cursor) {
                if (!cursor)
                    return;

                this.populateFromCursor(cursor);
            }));
    },

    _sanitizeTitle: function() {
        this.name = this.name.replace('Microsoft Word - ', '', 'g');
    },

    populateFromCursor: function(cursor) {
        this.uri = cursor.get_string(Query.QueryColumns.URI)[0];
        this.id = cursor.get_string(Query.QueryColumns.URN)[0];
        this.identifier = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
        this.author = cursor.get_string(Query.QueryColumns.AUTHOR)[0];
        this.resourceUrn = cursor.get_string(Query.QueryColumns.RESOURCE_URN)[0];
        this.favorite = cursor.get_boolean(Query.QueryColumns.FAVORITE);

        let mtime = cursor.get_string(Query.QueryColumns.MTIME)[0];
        let timeVal = Gd.time_val_from_iso8601(mtime)[1];
        this.mtime = timeVal.tv_sec;

        this.mimeType = cursor.get_string(Query.QueryColumns.MIMETYPE)[0];
        this.rdfType = cursor.get_string(Query.QueryColumns.RDFTYPE)[0];
        this._updateInfoFromType();

        // sanitize
        if (!this.uri)
            this.uri = '';

        let title = cursor.get_string(Query.QueryColumns.TITLE)[0];
        if (title && title != '')
            this.name = title;
        else
            this.name = Gd.filename_strip_extension(
                cursor.get_string(Query.QueryColumns.FILENAME)[0]);

        this._sanitizeTitle();

        this.refreshIcon();
    },

    updateIconFromType: function() {
        let icon = null;

        if (this.mimeType)
            icon = Gio.content_type_get_icon(this.mimeType);

        if (!icon)
            icon = Utils.iconFromRdfType(this.rdfType);

        let iconInfo =
            Gtk.IconTheme.get_default().lookup_by_gicon(icon, Utils.getIconSize(),
                                                        Gtk.IconLookupFlags.FORCE_SIZE |
                                                        Gtk.IconLookupFlags.GENERIC_FALLBACK);

        if (iconInfo != null) {
            try {
                this.pixbuf = iconInfo.load_icon();
            } catch (e) {
                log('Unable to load pixbuf: ' + e.toString());
            }
        }

        this.checkEffectsAndUpdateInfo();
    },

    _refreshCollectionIcon: function() {
        if (!this._collectionIconWatcher) {
            this._collectionIconWatcher = new CollectionIconWatcher(this);

            this._collectionIconWatcher.connect('icon-updated', Lang.bind(this,
                function(watcher, pixbuf) {
                    if (!pixbuf)
                        return;

                    this.pixbuf = pixbuf;
                    this.checkEffectsAndUpdateInfo();
                }));
        } else {
            this._collectionIconWatcher.refresh();
        }
    },

    refreshIcon: function() {
        if (this._thumbPath) {
            this._refreshThumbPath();
            return;
        }

        this.updateIconFromType();

        if (this.collection) {
            this._refreshCollectionIcon();
            return;
        }

        if (this._failedThumbnailing)
            return;

        if (!this._triedThumbnailing)
            this._triedThumbnailing = true;

        this._file = Gio.file_new_for_uri(this.uri);
        this._file.query_info_async(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                    0, 0, null,
                                    Lang.bind(this, this._onFileQueryInfo));
    },

    _onFileQueryInfo: function(object, res) {
        let info = null;
        let haveNewIcon = false;

        try {
            info = object.query_info_finish(res);
        } catch (e) {
            log('Unable to query info for file at ' + this.uri + ': ' + e.toString());
            this._failedThumbnailing = true;
            return;
        }

        this._thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
        if (this._thumbPath) {
            this._refreshThumbPath();
        } else {
            this.thumbnailed = false;

            // try to create the thumbnail
            Gd.queue_thumbnail_job_for_file_async(this._file,
                                                  Lang.bind(this, this._onQueueThumbnailJob));
        }
    },

    _onQueueThumbnailJob: function(object, res) {
        let thumbnailed = Gd.queue_thumbnail_job_for_file_finish(res);

        if (!thumbnailed) {
            this._failedThumbnailing = true;
            return;
        }

        // get the new thumbnail path
        this._file.query_info_async(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                    0, 0, null,
                                    Lang.bind(this, this._onThumbnailPathInfo));
    },

    _onThumbnailPathInfo: function(object, res) {
        let info = null;

        try {
            info = object.query_info_finish(res);
        } catch (e) {
            log('Unable to query info for file at ' + this.uri + ': ' + e.toString());
            this._failedThumbnailing = true;
            return;
        }

        this._thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
        if (this._thumbPath)
            this._refreshThumbPath();
        else
            this._failedThumbnailing = true;
    },

    _refreshThumbPath: function() {
        let thumbFile = Gio.file_new_for_path(this._thumbPath);

        thumbFile.read_async(GLib.PRIORITY_DEFAULT, null, Lang.bind(this,
            function(object, res) {
                try {
                    let stream = object.read_finish(res);
                    GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream,
                        Utils.getIconSize(), Utils.getIconSize(),
                        true, null, Lang.bind(this,
                            function(object, res) {
                                try {
                                    this.pixbuf = GdkPixbuf.Pixbuf.new_from_stream_finish(res);
                                    this.thumbnailed = true;
                                    this.checkEffectsAndUpdateInfo();
                                } catch (e) {
                                    this._failedThumbnailing = true;
                                }
                            }));
                } catch (e) {
                    this._failedThumbnailing = true;
                }
            }));
    },

    _updateInfoFromType: function() {
        if (this.rdfType.indexOf('nfo#DataContainer') != -1)
            this.collection = true;

        this.updateTypeDescription();
    },

    _createSymbolicEmblem: function(name) {
        let pix = Gd.create_symbolic_icon(name, Utils.getIconSize());

        if (!pix)
            pix = new Gio.ThemedIcon({ name: name });

        return pix;
    },

    checkEffectsAndUpdateInfo: function() {
        let emblemIcons = [];
        let pixbuf = this.pixbuf;
        let activeItem;

        // save the pixbuf before modifications, to use in collection icons
        this.pristinePixbuf = pixbuf;

        activeItem = Global.searchCategoryManager.getActiveItem();

        if (this.favorite &&
            (!activeItem ||
             (activeItem.id != Searchbar.SearchCategoryStock.FAVORITES)))
            emblemIcons.push(this._createSymbolicEmblem('emblem-favorite'));
        if (this.shared &&
            (!activeItem ||
             (activeItem.id != Searchbar.SearchCategoryStock.SHARED)))
            emblemIcons.push(this._createSymbolicEmblem('emblem-shared'));

        if (emblemIcons.length > 0) {
            let emblemedIcon = new Gio.EmblemedIcon({ gicon: this.pixbuf });

            emblemIcons.forEach(
                function(emblemIcon) {
                    let emblem = new Gio.Emblem({ icon: emblemIcon });
                    emblemedIcon.add_emblem(emblem);
                });

            let theme = Gtk.IconTheme.get_default();

            try {
                let iconInfo = theme.lookup_by_gicon(emblemedIcon,
                                                     Math.max(this.pixbuf.get_width(),
                                                              this.pixbuf.get_height()),
                                                     Gtk.IconLookupFlags.FORCE_SIZE);

                pixbuf = iconInfo.load_icon();
            } catch (e) {
                log('Unable to render the emblem: ' + e.toString());
            }
        }

        if (this.thumbnailed) {
            let [ slice, border ] = Utils.getThumbnailFrameBorder();
            this.pixbuf = Gd.embed_image_in_frame(pixbuf,
                Path.ICONS_DIR + 'thumbnail-frame.png',
                slice, border);
        } else {
            this.pixbuf = pixbuf;
        }

        this.emit('info-updated');
    },

    destroy: function() {
        if (this._collectionIconWatcher) {
            this._collectionIconWatcher.destroy();
            this._collectionIconWatcher = null;
        }

        Global.settings.disconnect(this._refreshIconId);
        Global.searchCategoryManager.disconnect(this._filterId);
    },

    open: function(screen, timestamp) {
        try {
            Gtk.show_uri(screen, this.uri, timestamp);
        } catch (e) {
            log('Unable to show URI ' + this.uri + ': ' + e.toString());
        }
    },

    setFavorite: function(favorite) {
        TrackerUtils.setFavorite(this.id, favorite, null);
    },

    getWhere: function() {
        let retval = '';

        if (this.collection)
            retval = '{ ?urn nie:isPartOf <' + this.id + '> }';

        return retval;
    }
};
Signals.addSignalMethods(DocCommon.prototype);

function LocalDocument(cursor) {
    this._init(cursor);
}

LocalDocument.prototype = {
    __proto__: DocCommon.prototype,

    _init: function(cursor) {
        this._failedThumbnailing = false;
        this._triedThumbnailing = false;

        DocCommon.prototype._init.call(this, cursor);

        this.sourceName = _("Local");

        let defaultApp = null;
        if (this.mimeType)
            defaultApp = Gio.app_info_get_default_for_type(this.mimeType, true);

        if (defaultApp)
            this.defaultAppName = defaultApp.get_name();
    },

    updateTypeDescription: function() {
        if (this.mimeType)
            this.typeDescription = Gio.content_type_get_description(this.mimeType);
    },

    load: function(cancellable, callback) {
        Gd.pdf_loader_load_uri_async(this.uri, cancellable, Lang.bind(this,
            function(source, res) {
                try {
                    let document = Gd.pdf_loader_load_uri_finish(res);
                    callback(this, document, null);
                } catch (e) {
                    callback(this, null, e);
                }
            }));
    },

    canTrash: function() {
        return this.collection;
    },

    trash: function() {
        if (this.collection) {
            let job = new DeleteItemJob(this.id);
            job.run(null);
        }
    }
};

const _GOOGLE_DOCS_SCHEME_LABELS = "http://schemas.google.com/g/2005/labels";
const _GOOGLE_DOCS_TERM_STARRED = "http://schemas.google.com/g/2005/labels#starred";

function GoogleDocument(cursor) {
    this._init(cursor);
}

GoogleDocument.prototype = {
    __proto__: DocCommon.prototype,

    _init: function(cursor) {
        this._triedThumbnailing = true;
        this._failedThumbnailing = true;

        DocCommon.prototype._init.call(this, cursor);

        // overridden
        this.defaultAppName = _("Google Docs");
        this.sourceName = _("Google");
    },

    _createGDataEntry: function(cancellable, callback) {
        let source = Global.sourceManager.getItemById(this.resourceUrn);

        let authorizer = new Gd.GDataGoaAuthorizer({ goa_object: source.object });
        let service = new GData.DocumentsService({ authorizer: authorizer });

        // HACK: GJS doesn't support introspecting GTypes, so we need to use
        // GObject.type_from_name(); but for that to work, we need at least one
        // instance of the GType in question to have ever been created. Ensure that
        let temp = new GData.DocumentsText();
        service.query_single_entry_async
            (service.get_primary_authorization_domain(),
             this.identifier, null,
             GObject.type_from_name('GDataDocumentsText'),
             cancellable, Lang.bind(this,
                 function(object, res) {
                     let entry = null;
                     let exception = null;

                     try {
                         entry = object.query_single_entry_finish(res);
                     } catch (e) {
                         exception = e;
                     }

                     callback(entry, service, exception);
                 }));
    },

    load: function(cancellable, callback) {
        this._createGDataEntry(cancellable, Lang.bind(this,
            function(entry, service, exception) {
                if (exception) {
                    // try loading from the most recent cache, if any
                    Gd.pdf_loader_load_uri_async(this.identifier, cancellable, Lang.bind(this,
                        function(source, res) {
                            try {
                                let document = Gd.pdf_loader_load_uri_finish(res);
                                callback(this, document, null);
                            } catch (e) {
                                // report the outmost error only
                                callback(this, null, exception);
                                return;
                            }
                        }));

                    return;
                }

                Gd.pdf_loader_load_entry_async
                    (entry, service, cancellable, Lang.bind(this,
                        function(source, res) {
                            try {
                                let document = Gd.pdf_loader_load_entry_finish(res);
                                callback(this, document, null);
                            } catch (e) {
                                callback(this, null, e);
                            }
                        }));
            }));
    },

    updateTypeDescription: function() {
        let description;

        if (this.rdfType.indexOf('nfo#Spreadsheet') != -1)
            description = _("Spreadsheet");
        else if (this.rdfType.indexOf('nfo#Presentation') != -1)
            description = _("Presentation");
        else if (this.rdfType.indexOf('nfo#DataContainer') != -1)
            description = _("Collection");
        else
            description = _("Document");

        this.typeDescription = description;
    },

    populateFromCursor: function(cursor) {
        this.shared = cursor.get_boolean(Query.QueryColumns.SHARED);

        DocCommon.prototype.populateFromCursor.call(this, cursor);
    },

    setFavorite: function(favorite) {
        DocCommon.prototype.setFavorite.call(this, favorite);

        this._createGDataEntry(null, Lang.bind(this,
            function(entry, service, exception) {
                if (!entry) {
                    log('Unable to call setFavorite on ' + this.name + ': ' + exception.toString());
                    return;
                }

                let starred = null;
                let categories = entry.get_categories();
                categories.forEach(
                    function(category) {
                        if (category.scheme == _GOOGLE_DOCS_SCHEME_LABELS &&
                            category.term == _GOOGLE_DOCS_TERM_STARRED)
                            starred = category;
                    });

                if (!starred) {
                    starred = new GData.Category({ scheme: _GOOGLE_DOCS_SCHEME_LABELS,
                                                   term: _GOOGLE_DOCS_TERM_STARRED });
                    entry.add_category(starred);
                }

                starred.set_label(favorite ? 'starred' : '');

                service.update_entry_async
                    (service.get_primary_authorization_domain(),
                     entry, null, Lang.bind(this,
                         function(service, res) {
                             try {
                                 service.update_entry_finish(res);
                             } catch (e) {
                                 log('Unable to call setFavorite on ' + this.name + ': ' + e.toString());
                             }
                         }));
            }));
    },

    canTrash: function() {
        return false;
    }
};

function DocumentManager() {
    this._init();
}

DocumentManager.prototype = {
    __proto__: Manager.BaseManager.prototype,

    _init: function() {
        Manager.BaseManager.prototype._init.call(this);

        this._model = new DocumentModel();

        Global.changeMonitor.connect('changes-pending',
                                     Lang.bind(this, this._onChangesPending));
    },

    _onChangesPending: function(monitor, changes) {
        for (idx in changes) {
            let changeEvent = changes[idx];

            if (changeEvent.type == ChangeMonitor.ChangeEventType.CHANGED) {
                let doc = this.getItemById(changeEvent.urn);

                if (doc)
                    doc.refresh();
            } else if (changeEvent.type == ChangeMonitor.ChangeEventType.CREATED) {
                this._onDocumentCreated(changeEvent.urn);
            } else if (changeEvent.type == ChangeMonitor.ChangeEventType.DELETED) {
                let doc = this.getItemById(changeEvent.urn);

                if (doc) {
                    this._model.documentRemoved(doc);

                    doc.destroy();
                    this.removeItemById(changeEvent.urn);

                    if (doc.collection)
                        Global.collectionManager.removeItemById(changeEvent.urn);
                }
            }
        }
    },

    _onDocumentCreated: function(urn) {
        let job = new SingleItemJob(urn);
        job.run(Query.QueryFlags.NONE, Lang.bind(this,
            function(cursor) {
                if (!cursor)
                    return;

                this.addDocumentFromCursor(cursor);
            }));
    },

    _identifierIsGoogle: function(identifier) {
        return (identifier &&
                (identifier.indexOf('https://docs.google.com') != -1));
    },

    createDocumentFromCursor: function(cursor) {
        let identifier = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
        let doc;

        if (this._identifierIsGoogle(identifier))
            doc = new GoogleDocument(cursor);
        else
            doc = new LocalDocument(cursor);

        return doc;
    },

    addDocumentFromCursor: function(cursor) {
        let doc = this.createDocumentFromCursor(cursor);
        this.addItem(doc);
        this._model.documentAdded(doc);

        if (doc.collection)
            Global.collectionManager.addItem(doc);

        return doc;
    },

    clear: function() {
        let items = this.getItems();
        for (idx in items) {
            items[idx].destroy();
        };

        Manager.BaseManager.prototype.clear.call(this);
        this._model.clear();
    },

    setActiveItem: function(doc) {
        if (Manager.BaseManager.prototype.setActiveItem.call(this, doc)) {

            if (doc && !doc.collection) {
                let recentManager = Gtk.RecentManager.get_default();
                recentManager.add_item(doc.uri);
            }
        }
    },

    getModel: function() {
        return this._model;
    }
};

function DocumentModel() {
    this._init();
}

DocumentModel.prototype = {
    _init: function() {
        this.model = Gd.create_list_store();
        this.model.set_sort_column_id(Gd.MainColumns.MTIME,
                                      Gtk.SortType.DESCENDING);
    },

    clear: function() {
        this.model.clear();
    },

    documentAdded: function(doc) {
        let iter = this.model.append();

        Gd.store_set(this.model, iter,
                     doc.id, doc.uri,
                     doc.name, doc.author,
                     doc.pixbuf, doc.mtime);

        let treePath = this.model.get_path(iter);
        let treeRowRef = Gtk.TreeRowReference.new(this.model, treePath);

        doc.connect('info-updated', Lang.bind(this,
            function() {
                let objectPath = treeRowRef.get_path();
                if (!objectPath)
                    return;

                let objectIter = this.model.get_iter(objectPath)[1];
                if (objectIter)
                    Gd.store_set(this.model, iter,
                                 doc.id, doc.uri,
                                 doc.name, doc.author,
                                 doc.pixbuf, doc.mtime);
            }));
    },

    documentRemoved: function(doc) {
        this.model.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = model.get_value(iter, Gd.MainColumns.ID);

                if (id == doc.id) {
                    this.model.remove(iter);
                    return true;
                }

                return false;
            }));
    }
};
