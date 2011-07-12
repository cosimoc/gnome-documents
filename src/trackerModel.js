const Lang = imports.lang;
const Signals = imports.signals;

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Tracker = imports.gi.Tracker;
const Gd = imports.gi.Gd;
const GdkPixbuf = imports.gi.GdkPixbuf;

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

const OFFSET_STEP = 52; // needs to be multiple of four

const TrackerColumns = {
    URN: 0,
    URI: 1,
    TITLE: 2,
    AUTHOR: 3,
    MTIME: 4,
    TOTAL_COUNT: 5
};

const _ICON_VIEW_SIZE = 128;
const _LIST_VIEW_SIZE = 48;
const _FILE_ATTRIBUTES = 'standard::icon,standard::content-type,thumbnail::path,time::modified';

function TrackerModel(callback) {
    this._init(callback);
}

TrackerModel.prototype = {
    _init: function(callback) {
        this._initCallback = callback;
        Main.settings.connect('changed::list-view', Lang.bind(this, this._onSettingsChanged));

        this.model = Gd.create_list_store();
        this._initConnection();
    },

    _initConnection: function() {
        Tracker.SparqlConnection.get_async(null, Lang.bind(this, function(object, res) {
            try {
                this._connection = Tracker.SparqlConnection.get_finish(res);
            } catch (e) {
                log('Unable to connect to the tracker database: ' + e.toString());
                Main.application.quit();
            }

            if (this._initCallback)
                this._initCallback();
        }));
    },

    _onSettingsChanged: function() {
        this.model.clear();
        this._performCurrentQuery();
    },

    _getIconSize: function() {
        return Main.settings.get_boolean('list-view') ? _LIST_VIEW_SIZE : _ICON_VIEW_SIZE;
    },

    _buildOverviewQuery: function(offset, searchString) {
        let sparql = 
            ('SELECT ?urn ' + // urn
             '?uri ' + // uri
             'tracker:coalesce(nie:title(?urn), nfo:fileName(?urn)) ' + // title
             'tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher)) ' + // author
             '?mtime ' + // mtime
             '(SELECT COUNT(?doc) WHERE { ?doc a nfo:PaginatedTextDocument . ' +
             'FILTER (fn:contains (fn:lower-case (tracker:coalesce(nie:title(?doc), nfo:fileName(?doc))), "%s"))' +
             '}) ' + // total filtered count
             'WHERE { ?urn a nfo:PaginatedTextDocument; nie:url ?uri; nfo:fileLastModified ?mtime . ' +
             'OPTIONAL { ?urn nco:creator ?creator . } ' +
             'OPTIONAL { ?urn nco:publisher ?publisher . } ' +
             'FILTER (fn:contains (fn:lower-case (tracker:coalesce(nie:title(?urn), nfo:fileName(?urn))), "%s"))' +
             ' } ' +
             'ORDER BY DESC (?mtime)' +
             'LIMIT %d OFFSET %d').format(searchString, searchString, OFFSET_STEP, this._offset);

        return sparql;
    },

    _addRowFromCursor: function(cursor) {
        let urn = cursor.get_string(TrackerColumns.URN)[0];
        let uri = cursor.get_string(TrackerColumns.URI)[0];
        let title = cursor.get_string(TrackerColumns.TITLE)[0];
        let author = cursor.get_string(TrackerColumns.AUTHOR)[0];
        let mtime = cursor.get_string(TrackerColumns.MTIME)[0];

        this._itemCount = cursor.get_integer(TrackerColumns.TOTAL_COUNT);

        let found = false;

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
                                                                                      this._getIconSize(), this._getIconSize());
                                  } else {
                                      let icon = info.get_icon();

                                      if (icon) {
                                          let theme = Gtk.IconTheme.get_default();
                                          let iconInfo = theme.lookup_by_gicon(icon, this._getIconSize(),
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
                                                                                                                        this._getIconSize(), this._getIconSize());

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

            if (!valid) {
                // signal the total count update and return
                this._emitCountUpdated();
                return;
            }
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

    _performCurrentQuery: function() {
        this._connection.query_async(this._currentQueryBuilder(this._offset, this._filter), null,
                                     Lang.bind(this, this._onQueryExecuted));
    },

    _emitCountUpdated: function() {
        this.emit('count-updated', this._itemCount, this._offset);
    },

    populateForOverview: function() {
        this._currentQueryBuilder = this._buildOverviewQuery;

        this._offset = 0;
        this._filter = '';

        this._performCurrentQuery();
    },

    loadMore: function() {
        this._offset += OFFSET_STEP;
        this._performCurrentQuery();
    },

    setFilter: function(filter) {
        this.model.clear();

        this._offset = 0;
        this._filter = filter;

        this._performCurrentQuery();
    }
}

Signals.addSignalMethods(TrackerModel.prototype);