const Gd = imports.gi.Gd;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Main = imports.main;
const MainToolbar = imports.mainToolbar;
const TrackerModel = imports.trackerModel;
const _ = imports.gettext.gettext;

const _WINDOW_DEFAULT_WIDTH = 860;
const _WINDOW_DEFAULT_HEIGHT = 600;

const _VIEW_ITEM_WIDTH = 152;
const _VIEW_ITEM_WRAP_WIDTH = 140;
const _VIEW_COLUMN_SPACING = 20;
const _VIEW_COLUMNS = 4;
const _VIEW_MARGIN = 16;

const _SEARCH_ENTRY_TIMEOUT = 200;

function MainWindow() {
    this._init();
}

MainWindow.prototype = {
    _init: function() {
        this._initGtkWindow();
        this._initUi();
        this._initModel();
    },

    _initGtkWindow: function() {
        this.window = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                       window_position: Gtk.WindowPosition.CENTER,
                                       resizable: false,
                                       title: _('Documents') });

        this.window.set_size_request(_WINDOW_DEFAULT_WIDTH, _WINDOW_DEFAULT_HEIGHT);
        this.window.connect('delete-event',
                            Lang.bind(this, this._onDeleteEvent));
    },

    _initView: function() {
        this._viewBox = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL });

        this.view = new Gtk.IconView({ hexpand: true,
                                       vexpand: true });

        this.view.item_width = _VIEW_ITEM_WIDTH;
        this.view.column_spacing = _VIEW_COLUMN_SPACING;
        this.view.columns = _VIEW_COLUMNS;
        this.view.margin = _VIEW_MARGIN;
        this.view.set_selection_mode(Gtk.SelectionMode.MULTIPLE);

        this.view.connect('item-activated', Lang.bind(this, this._onViewItemActivated));

        this._viewBox.add(this.view);

        this._loadMore = new Gtk.Button({ label: 'Load more documents' });
        this._viewBox.add(this._loadMore);

        this._loadMore.connect('clicked', Lang.bind(this, function() {
            this._model.loadMore();
        }));

        this._scrolledWin.add_with_viewport(this._viewBox);
    },

    _initUi: function() {
        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    vexpand: true });
        this.window.add(this._grid);

        this._searchTimeout = 0;
        this.toolbar = new MainToolbar.MainToolbar();
        this.toolbar.setOverview();
        this.toolbar.searchEntry.connect('changed', 
                                         Lang.bind(this, this._onSearchEntryChanged));

        this._grid.add(this.toolbar.toolbar);

        this._scrolledWin = new Gtk.ScrolledWindow({ hexpand: true,
                                                     vexpand: true });
        this._grid.add(this._scrolledWin);
        this._initView();

        this._grid.show_all();
    },

    _initModel: function() {
        this._model = new TrackerModel.TrackerModel(Lang.bind(this, this._onModelCreated));
    },

    _setModelView: function() {
        this.view.set_model(this._model.model);
        this.view.set_pixbuf_column(TrackerModel.ModelColumns.ICON);

        this._renderer = new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                                   wrap_mode: Pango.WrapMode.WORD_CHAR,
                                                   wrap_width: _VIEW_ITEM_WRAP_WIDTH,
                                                   xalign: 0.5,
                                                   yalign: 0.0,
                                                   text_lines: 3 });
        this.view.pack_start(this._renderer, false);
        this.view.add_attribute(this._renderer,
                                'text', TrackerModel.ModelColumns.TITLE);
        this.view.add_attribute(this._renderer,
                                'line-two', TrackerModel.ModelColumns.AUTHOR);
    },

    _onModelCreated: function() {
        this._setModelView();
        this._model.populateForOverview();
    },

    _onDeleteEvent: function() {
        Main.application.quit();
    },

    _onViewItemActivated: function(view, path) {
        let iter = this._model.model.get_iter(path)[1];
        let uri = this._model.model.get_value(iter, TrackerModel.ModelColumns.URI);

        try {
            Gtk.show_uri(null, uri, Gtk.get_current_event_time());
        } catch (e) {
            log('Unable to open ' + uri + ': ' + e.toString())
        }
    },

    _onSearchEntryChanged: function() {
        if (this._searchTimeout != 0) {
            GLib.source_remove(this._searchTimeout)
            this._searchTimeout = 0;
        }

        this._searchTimeout = Mainloop.timeout_add(_SEARCH_ENTRY_TIMEOUT,
                                                   Lang.bind(this, this._onSearchEntryTimeout));
    },

    _onSearchEntryTimeout: function() {
        this._searchTimeout = 0;

        let text = this.toolbar.searchEntry.get_text();
        this._model.setFilter(text);
    }
}
