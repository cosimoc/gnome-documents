const Lang = imports.lang;

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Tracker = imports.gi.Tracker;
const Gd = imports.gi.Gd;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GnomeDesktop = imports.gi.GnomeDesktop;

const Main = imports.main;

const ModelColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    ICON: 5,
    N_COLUMNS: 6
};

const _ICON_VIEW_SIZE = 128;
const _FILE_ATTRIBUTES = 'standard::icon,standard::content-type,thumbnail::path,time::modified';

function TrackerModel(callback) {
    this._init(callback);
}

TrackerModel.prototype = {
    _init: function(callback) {
        this._initCallback = callback;

        this.model = Gd.create_list_store();
        this._initConnection();
    },

    _initConnection: function() {
        Tracker.SparqlConnection.get_async(null, Lang.bind(this, function(object, res) {
            try {
                this._connection = Tracker.SparqlConnection.get_finish(res);

                if (this._initCallback)
                    this._initCallback();
            } catch (e) {
                log('Unable to connect to the tracker database: ' + e.toString());
                Main.application.quit();
            }
        }));
    },

    _buildOverviewQuery: function() {
        let sparql = 
            'SELECT ?urn ' + // urn
            '?uri ' + // uri
            'tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) ' + // title
            'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher)) ' + // author
            'nfo:fileLastModified(?urn) ' + // mtime
            'WHERE { ?urn a nfo:PaginatedTextDocument; nie:url ?uri . ' +
            'OPTIONAL { ?urn nco:creator ?creator . } ' +
            'OPTIONAL { ?urn nco:publisher ?publisher . } }';

        return sparql;
    },

    _addRowFromCursor: function(cursor) {
        let urn = cursor.get_string(ModelColumns.URN)[0];
        let uri = cursor.get_string(ModelColumns.URI)[0];
        let title = cursor.get_string(ModelColumns.TITLE)[0];
        let author = cursor.get_string(ModelColumns.AUTHOR)[0];
        let mtime = cursor.get_string(ModelColumns.MTIME)[0];

        if (!author)
            author = '';

        let file = Gio.file_new_for_uri(uri);
        file.query_info_async(_FILE_ATTRIBUTES,
                              0, 0, null,
                              Lang.bind(this, function(object, res) {
                                  let info = {};
                                  let pixbuf = {};
                                  let treePath = {};

                                  try {
                                      info = object.query_info_finish(res);
                                  } catch (e) {
                                      log('Unable to query info for file at ' + uri + ': ' + e.toString());
                                      return;
                                  }

                                  let thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);
                                  if (thumbPath) {
                                      pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(thumbPath,
                                                                                      _ICON_VIEW_SIZE, _ICON_VIEW_SIZE);
                                  } else {
                                      let icon = info.get_icon();

                                      if (icon) {
                                          let theme = Gtk.IconTheme.get_default();
                                          let iconInfo = theme.lookup_by_gicon(icon, _ICON_VIEW_SIZE,
                                                                               Gtk.IconLookupFlags.FORCE_SIZE |
                                                                               Gtk.IconLookupFlags.GENERIC_FALLBACK);
                                          pixbuf = iconInfo.load_icon();
                                      }

                                      // try to create the thumbnail
                                      Gd.queue_thumbnail_job_for_file_async(file, Lang.bind(this, function(object, res) {
                                          let thumbnailed = Gd.queue_thumbnail_job_for_file_finish(res);

                                          if (!thumbnailed)
                                              return;

                                          // get the new thumbnail path
                                          file.query_info_async(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH,
                                                                0, 0, null,
                                                                Lang.bind(this, function(object, res) {
                                                                    try {
                                                                        info = object.query_info_finish(res);
                                                                    } catch (e) {
                                                                        log('Unable to query info for file at ' + uri + ': ' + e.toString());
                                                                        return;
                                                                    }

                                                                    thumbPath = info.get_attribute_byte_string(Gio.FILE_ATTRIBUTE_THUMBNAIL_PATH);

                                                                    if (thumbPath) {
                                                                        pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(thumbPath,
                                                                                                                        _ICON_VIEW_SIZE, _ICON_VIEW_SIZE);

                                                                        let objectIter = this.model.get_iter(treePath)[1];
                                                                        if (objectIter)
                                                                            Gd.store_update_icon(this.model, objectIter, pixbuf);
                                                                    }
                                                                }));
                                      }));
                                  }

                                  let iter = this.model.append();
                                  treePath = this.model.get_path(iter);

                                  Gd.store_set(this.model, iter,
                                               urn, uri, title, author, mtime, pixbuf);
                              }));
    },

    _onCursorNext: function(cursor, res) {
        try {
            let valid = cursor.next_finish(res);

            if (!valid)
                return;
        } catch (e) {
            // FIXME: error handling
            log('Unable to fetch results from cursor: ' + e.toString());

            return;
        }

        this._addRowFromCursor(cursor)
        cursor.next_async(null, Lang.bind(this, this._onCursorNext));
    },

    _onQueryExecuted: function(object, res) {
        try {
            let cursor = object.query_finish(res);
            cursor.next_async(null, Lang.bind(this, this._onCursorNext));
        } catch (e) {
            // FIXME: error handling
            log('Unable to execute query: ' + e.toString());
        }
    },

    populateForOverview: function() {
        this._connection.query_async(this._buildOverviewQuery(), null,
                                     Lang.bind(this, this._onQueryExecuted));
    }
}