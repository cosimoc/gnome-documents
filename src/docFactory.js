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

const Global = imports.global;
const TrackerModel = imports.trackerModel;
const Utils = imports.utils;

function DocCommon(cursor) {
    this._init(cursor);
}

DocCommon.prototype = {
    _init: function(cursor) {
        this.urn = cursor.get_string(TrackerModel.TrackerColumns.URN)[0];
        this.title = cursor.get_string(TrackerModel.TrackerColumns.TITLE)[0];
        this.author = cursor.get_string(TrackerModel.TrackerColumns.AUTHOR)[0];
        this.mtime = cursor.get_string(TrackerModel.TrackerColumns.MTIME)[0];
        this.resourceUrn = cursor.get_string(TrackerModel.TrackerColumns.RESOURCE_URN)[0];

        this._type = cursor.get_string(TrackerModel.TrackerColumns.TYPE)[0];
        this.pixbuf = Utils.pixbufFromRdfType(this._type);

        // sanitize
        if (!this.author)
            this.author = '';

        // overridden in subclasses
        this.uri = null;

        this._refreshIconId =
            Global.settings.connect('changed::list-view',
                                    Lang.bind(this, this.refreshIcon));
    },

    refreshIcon: function() {
        this.pixbuf = Utils.pixbufFromRdfType(this._type);
        this.emit('icon-updated');
    },

    destroy: function() {
        Global.settings.disconnect(this._refreshIconId);
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
        DocCommon.prototype._init.call(this, cursor);

        // overridden
        this.uri = cursor.get_string(TrackerModel.TrackerColumns.URI)[0];
        this.refreshIcon();
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
            this.emit('icon-updated');
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

            this.emit('icon-updated');
        }
    }
};

function GoogleDocument(cursor) {
    this._init(cursor);
}

GoogleDocument.prototype = {
    __proto__: DocCommon.prototype,

    _init: function(cursor) {
        DocCommon.prototype._init.call(this, cursor);

        // overridden
        this.uri = cursor.get_string(TrackerModel.TrackerColumns.IDENTIFIER)[0];
    }
};

function DocFactory() {
    this._init();
}

DocFactory.prototype = {
    _init: function() {
    },

    _identifierIsGoogle: function(identifier) {
        return (identifier &&
                (identifier.indexOf('https://docs.google.com') != -1));
    },

    newDocument: function(cursor) {
        let identifier = cursor.get_string(TrackerModel.TrackerColumns.IDENTIFIER)[0];

        if (this._identifierIsGoogle(identifier))
            return new GoogleDocument(cursor);

        return new LocalDocument(cursor);
    }
};
