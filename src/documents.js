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
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Signals = imports.signals;

const Categories = imports.categories;
const ChangeMonitor = imports.changeMonitor;
const Global = imports.global;
const Path = imports.path;
const Query = imports.query;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;

const _THUMBNAIL_FRAME = 3;

function DocCommon(cursor) {
    this._init(cursor);
}

DocCommon.prototype = {
    _init: function(cursor) {
        this.urn = null;
        this.uri = null;
        this.title = null;
        this.author = null;
        this.mtime = null;
        this.resourceUrn = null;
        this.favorite = null;
        this.pixbuf = null;
        this.defaultAppName = null;

        this.mimeType = null;
        this.rdfType = null;
        this.typeDescription = null;
        this.sourceName = null;

        this.favorite = false;
        this.shared = false;

        this._thumbnailed = false;

        this.populateFromCursor(cursor);

        this._refreshIconId =
            Global.settings.connect('changed::list-view',
                                    Lang.bind(this, this.refreshIcon));
        this._changesId =
            Global.changeMonitor.connect('changes-pending',
                                         Lang.bind(this, this._onChangesPending));
        this._categoryId =
            Global.categoryManager.connect('active-category-changed',
                                           Lang.bind(this, this.refreshIcon));
    },

    _onChangesPending: function(monitor, changes) {
        if (changes[0] == this.urn)
            this._refresh();
    },

    _refresh: function() {
        let sparql = Global.queryBuilder.buildSingleQuery(this.urn);

        Global.connection.query_async(sparql, null, Lang.bind(this,
            function(object, res) {
                let cursor = null;

                try {
                    cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this,
                        function(object, res) {
                            let valid = object.next_finish(res);
                            if (valid)
                                this.populateFromCursor(object);
                        }));
                } catch (e) {
                    log('Unable to refresh file information: ' + e.toString());
                    return;
                }
            }));
    },

    _sanitizeTitle: function() {
        this.title = this.title.replace('Microsoft Word - ', '', 'g');
    },

    populateFromCursor: function(cursor) {
        this.uri = cursor.get_string(Query.QueryColumns.URI)[0];
        this.urn = cursor.get_string(Query.QueryColumns.URN)[0];
        this.author = cursor.get_string(Query.QueryColumns.AUTHOR)[0];
        this.mtime = cursor.get_string(Query.QueryColumns.MTIME)[0];
        this.resourceUrn = cursor.get_string(Query.QueryColumns.RESOURCE_URN)[0];
        this.favorite = cursor.get_boolean(Query.QueryColumns.FAVORITE);

        this.mimeType = cursor.get_string(Query.QueryColumns.MIMETYPE)[0];
        this.rdfType = cursor.get_string(Query.QueryColumns.RDFTYPE)[0];
        this.updateIconFromType();

        this.updateTypeDescription();

        // sanitize
        if (!this.uri)
            this.uri = '';

        let title = cursor.get_string(Query.QueryColumns.TITLE)[0];
        if (title && title != '')
            this.title = title;
        else
            this.title = Gd.filename_strip_extension(
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

    refreshIcon: function() {
        this.updateIconFromType();
    },

    _createSymbolicEmblem: function(name) {
        let symbolicName = name + '-symbolic';
        let icon = new Gio.ThemedIcon({ name: symbolicName });

        let theme = Gtk.IconTheme.get_default();
        let info = theme.lookup_by_gicon(icon, 64, Gtk.IconLookupFlags.FORCE_SIZE);

        let rgba = new Gdk.RGBA();
        rgba.parse("#3465a4");

        let pix = null;

        try {
            pix = info.load_symbolic(rgba, null, null, null, null)[0];
        } catch (e) {
            pix = new Gio.ThemedIcon({ name: name });
        }

        return pix;
    },

    checkEffectsAndUpdateInfo: function() {
        let emblemIcons = [];
        let pixbuf = this.pixbuf;

        if (this.favorite &&
            (Global.categoryManager.getActiveCategoryId() != Categories.StockCategories.FAVORITES))
            emblemIcons.push(this._createSymbolicEmblem('emblem-favorite'));
        if (this.shared && (Global.categoryManager.getActiveCategoryId() != Categories.StockCategories.SHARED))
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

        if (this.thumbnailed)
            this.pixbuf = Gd.embed_image_in_frame(pixbuf,
                Global.documentManager.getPixbufFrame(),
                _THUMBNAIL_FRAME, _THUMBNAIL_FRAME,
                _THUMBNAIL_FRAME, _THUMBNAIL_FRAME);
        else
            this.pixbuf = pixbuf;

        this.emit('info-updated');
    },

    destroy: function() {
        Global.settings.disconnect(this._refreshIconId);
        Global.changeMonitor.disconnect(this._changesId);
        Global.categoryManager.disconnect(this._categoryId);
    },

    open: function(screen, timestamp) {
        Gtk.show_uri(screen, this.uri, timestamp);
    },

    setFavorite: function(favorite) {
        TrackerUtils.setFavorite(this.urn, favorite, null);
    }
};
Signals.addSignalMethods(DocCommon.prototype);

const _FILE_ATTRIBUTES = 'thumbnail::path';

function LocalDocument(cursor) {
    this._init(cursor);
}

LocalDocument.prototype = {
    __proto__: DocCommon.prototype,

    _init: function(cursor) {
        this._thumbPath = null;
        this._failedThumbnailing = false;

        DocCommon.prototype._init.call(this, cursor);

        this.sourceName = _("Local");
        let defaultApp = Gio.app_info_get_default_for_type(this.mimeType, true);
        this.defaultAppName = defaultApp.get_name();
    },

    updateTypeDescription: function() {
        this.typeDescription = Gio.content_type_get_description(this.mimeType);
    },

    _refreshThumbPath: function() {
        this.pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(this._thumbPath,
                                                             Utils.getIconSize(),
                                                             Utils.getIconSize());
        this.thumbnailed = true;
        this.checkEffectsAndUpdateInfo();
        return;
    },

    refreshIcon: function() {
        if (this._thumbPath) {
            this._refreshThumbPath();
            return;
        }

        if (this._failedThumbnailing) {
            this.updateIconFromType();
            return;
        }

        this._file = Gio.file_new_for_uri(this.uri);
        this._file.query_info_async(_FILE_ATTRIBUTES,
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

    loadPreview: function(cancellable, callback) {
        Gd.pdf_loader_load_uri_async(this.uri, cancellable, Lang.bind(this,
            function(source, res) {
                try {
                    let document = Gd.pdf_loader_load_uri_finish(res);
                    callback(document);
                } catch (e) {
                    Global.errorHandler.addLoadError(this, e);
                }
            }));
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
        DocCommon.prototype._init.call(this, cursor);

        // overridden
        this.identifier = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
        this.defaultAppName = _("Google Docs");
        this.sourceName = _("Google");
    },

    _createGDataEntry: function(cancellable, callback) {
        let source = Global.sourceManager.getSourceByUrn(this.resourceUrn);

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

    loadPreview: function(cancellable, callback) {
        this._createGDataEntry(cancellable, Lang.bind(this,
            function(entry, service, exception) {
                if (exception) {
                    Global.errorHandler.addLoadError(this, exception);
                    return;
                }

            Gd.pdf_loader_load_entry_async
                (entry, service, cancellable, Lang.bind(this,
                    function(source, res) {
                        try {
                            let document = Gd.pdf_loader_load_entry_finish(res);
                            callback(document);
                        } catch (e) {
                            Global.errorHandler.addLoadError(this, e);
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
                    log('Unable to call setFavorite on ' + this.title + ': ' + exception.toString());
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
                                 log('Unable to call setFavorite on ' + this.title + ': ' + e.toString());
                             }
                         }));
            }));
    }
};

function DocumentManager() {
    this._init();
}

DocumentManager.prototype = {
    _init: function() {
        this._docs = {};
        this._activeDocument = null;

        this._pixbufFrame = GdkPixbuf.Pixbuf.new_from_file(Path.ICONS_DIR + 'thumbnail-frame.png');
    },

    _identifierIsGoogle: function(identifier) {
        return (identifier &&
                (identifier.indexOf('https://docs.google.com') != -1));
    },

    getPixbufFrame: function() {
        return this._pixbufFrame;
    },

    addDocument: function(cursor) {
        let identifier = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
        let doc;

        if (this._identifierIsGoogle(identifier))
            doc = new GoogleDocument(cursor);
        else
            doc = new LocalDocument(cursor);

        this._docs[doc.urn] = doc;
        this.emit('new-document', doc);
    },

    clear: function() {
        for (idx in this._docs) {
            this._docs[idx].destroy();
        };
        this._docs = {};
        this.emit('clear');
    },

    getDocuments: function() {
        return this._docs;
    },

    lookupDocument: function(urn) {
        let document = null;

        if (this._docs[urn])
            document = this._docs[urn];

        return document;
    },

    setActiveDocument: function(doc) {
        if (doc == this._activeDocument)
            return;

        this._activeDocument = doc;
    },

    getActiveDocument: function() {
        return this._activeDocument;
    }
};
Signals.addSignalMethods(DocumentManager.prototype);

const ModelColumns = {
    URN: 0,
    TITLE: 1,
    AUTHOR: 2,
    ICON: 3
};

function DocumentModel() {
    this._init();
}

DocumentModel.prototype = {
    _init: function() {
        this.model = Gd.create_list_store();
        this._documentManager = Global.documentManager;

        this._documentManager.connect('clear', Lang.bind(this, this._onManagerClear));
        this._documentManager.connect('new-document', Lang.bind(this, this._onNewDocument));

        let documents = this._documentManager.getDocuments();
        for (idx in this._documentManager.getDocuments())
            this._onNewDocument(this._documentManager, documents[idx]);
    },

    _onManagerClear: function() {
        this.model.clear();
    },

    _onNewDocument: function(manager, doc) {
        let iter = this.model.append();
        let treePath = this.model.get_path(iter);

        Gd.store_set(this.model, iter,
                     doc.urn,
                     doc.title, doc.author,
                     doc.pixbuf);

        doc.connect('info-updated', Lang.bind(this,
            function() {
                let objectIter = this.model.get_iter(treePath)[1];
                if (objectIter)
                    Gd.store_set(this.model, iter,
                                 doc.urn,
                                 doc.title, doc.author,
                                 doc.pixbuf);
            }));
    }
};
