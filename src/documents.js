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
const Gtk = imports.gi.Gtk;

const Lang = imports.lang;
const Signals = imports.signals;

const ChangeMonitor = imports.changeMonitor;
const Global = imports.global;
const Query = imports.query;
const Utils = imports.utils;

function DocCommon(cursor) {
    this._init(cursor);
}

DocCommon.prototype = {
    _init: function(cursor) {
        this.urn = null;
        this.title = null;
        this.author = null;
        this.mtime = null;
        this.resourceUrn = null;
        this.favorite = null;
        this._type = null;
        this.pixbuf = null;

        this._populateFromCursor(cursor);

        this._refreshIconId =
            Global.settings.connect('changed::list-view',
                                    Lang.bind(this, this.refreshIcon));

        this._changesId =
            Global.changeMonitor.connect('changes-pending',
                                         Lang.bind(this, this._onChangesPending));
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
                                this._populateFromCursor(object);
                        }));
                } catch (e) {
                    log('Unable to refresh file information: ' + e.toString());
                    return;
                }
            }));
    },

    _populateFromCursor: function(cursor) {
        this.urn = cursor.get_string(Query.QueryColumns.URN)[0];
        this.title = cursor.get_string(Query.QueryColumns.TITLE)[0];
        this.author = cursor.get_string(Query.QueryColumns.AUTHOR)[0];
        this.mtime = cursor.get_string(Query.QueryColumns.MTIME)[0];
        this.resourceUrn = cursor.get_string(Query.QueryColumns.RESOURCE_URN)[0];
        this.favorite = cursor.get_boolean(Query.QueryColumns.FAVORITE);

        this._type = cursor.get_string(Query.QueryColumns.TYPE)[0];
        this.pixbuf = Utils.pixbufFromRdfType(this._type);

        // sanitize
        if (!this.author)
            this.author = '';

        this.refreshIcon();
    },

    refreshIcon: function() {
        this.pixbuf = Utils.pixbufFromRdfType(this._type);
        this.checkEmblemsAndUpdateInfo();
    },

    checkEmblemsAndUpdateInfo: function() {
        if (this.favorite) {
            let emblemIcon = new Gio.ThemedIcon({ name: 'emblem-favorite' });
            let emblem = new Gio.Emblem({ icon: emblemIcon });
            let emblemedIcon = new Gio.EmblemedIcon({ gicon: this.pixbuf });
            emblemedIcon.add_emblem(emblem);

            let theme = Gtk.IconTheme.get_default();

            try {
                let iconInfo = theme.lookup_by_gicon(emblemedIcon,
                                                     Math.max(this.pixbuf.get_width(),
                                                              this.pixbuf.get_height()),
                                                     Gtk.IconLookupFlags.FORCE_SIZE);
                this.pixbuf = iconInfo.load_icon();
            } catch (e) {
                log('Unable to render the emblem: ' + e.toString());
            }
        }

        this.emit('info-updated');
    },

    destroy: function() {
        Global.settings.disconnect(this._refreshIconId);
        Global.changeMonitor.disconnect(this._changesId);
    }
};
Signals.addSignalMethods(DocCommon.prototype);

const _FILE_ATTRIBUTES = 'standard::icon,standard::content-type,thumbnail::path,time::modified';

function LocalDocument(cursor) {
    this._init(cursor);
}

LocalDocument.prototype = {
    __proto__: DocCommon.prototype,

    _init: function(cursor) {
        // overridden
        this.uri = cursor.get_string(Query.QueryColumns.URI)[0];

        DocCommon.prototype._init.call(this, cursor);
    },

    refreshIcon: function() {
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
            return;
        }

        let thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
        if (thumbPath) {
            this.pixbuf =
                GdkPixbuf.Pixbuf.new_from_file_at_size(thumbPath,
                                                       Utils.getIconSize(),
                                                       Utils.getIconSize());
            haveNewIcon = true;
        } else {
            let icon = info.get_icon();

            if (icon) {
                let theme = Gtk.IconTheme.get_default();
                let iconInfo = theme.lookup_by_gicon(icon, Utils.getIconSize(),
                                                     Gtk.IconLookupFlags.FORCE_SIZE |
                                                     Gtk.IconLookupFlags.GENERIC_FALLBACK);
                try {
                    this.pixbuf = iconInfo.load_icon();
                    haveNewIcon = true;
                } catch (e) {
                    log('Unable to load an icon from theme for file at ' + this.uri + ': ' + e.toString());
                }
            }

            // try to create the thumbnail
            Gd.queue_thumbnail_job_for_file_async(this._file,
                                                  Lang.bind(this, this._onQueueThumbnailJob));
        }

        if (haveNewIcon)
            this.checkEmblemsAndUpdateInfo();
    },

    _onQueueThumbnailJob: function(object, res) {
        let thumbnailed = Gd.queue_thumbnail_job_for_file_finish(res);

        if (!thumbnailed)
            return;

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
            return;
        }

        let thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

        if (thumbPath) {
            this.pixbuf =
                GdkPixbuf.Pixbuf.new_from_file_at_size(thumbPath,
                                                       Utils.getIconSize(),
                                                       Utils.getIconSize());

            this.checkEmblemsAndUpdateInfo();
        }
    }
};

function GoogleDocument(cursor) {
    this._init(cursor);
}

GoogleDocument.prototype = {
    __proto__: DocCommon.prototype,

    _init: function(cursor) {
        // overridden
        this.uri = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];

        DocCommon.prototype._init.call(this, cursor);
    }
};

function DocumentManager() {
    this._init();
}

DocumentManager.prototype = {
    _init: function() {
        this._docs = [];
    },

    _identifierIsGoogle: function(identifier) {
        return (identifier &&
                (identifier.indexOf('https://docs.google.com') != -1));
    },

    newDocument: function(cursor) {
        let identifier = cursor.get_string(Query.QueryColumns.IDENTIFIER)[0];
        let doc;

        if (this._identifierIsGoogle(identifier))
            doc = new GoogleDocument(cursor);
        else
            doc = new LocalDocument(cursor);

        this._docs.push(doc);
        this.emit('new-document', doc);

        return doc;
    },

    clear: function() {
        this._docs.forEach(function(doc) {
            doc.destroy();
        });
        this._docs = [];
        this.emit('clear');
    }
};
Signals.addSignalMethods(DocumentManager.prototype);

const ModelColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    ICON: 5,
    RESOURCE_URN: 6,
    FAVORITE: 7
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
    },

    _onManagerClear: function() {
        this.model.clear();
    },

    _onNewDocument: function(manager, doc) {
        let iter = this.model.append();
        let treePath = this.model.get_path(iter);

        Gd.store_set(this.model, iter,
                     doc.urn, doc.uri,
                     doc.title, doc.author,
                     doc.mtime, doc.pixbuf,
                     doc.resourceUrn, doc.favorite);

        doc.connect('info-updated', Lang.bind(this,
            function() {
                let objectIter = this.model.get_iter(treePath)[1];
                if (objectIter)
                    Gd.store_set(this.model, iter,
                                 doc.urn, doc.uri,
                                 doc.title, doc.author,
                                 doc.mtime, doc.pixbuf,
                                 doc.resourceUrn, doc.favorite);
            }));
    }
};