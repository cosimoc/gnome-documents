const Gtk = imports.gi.Gtk;
const Gd = imports.gi.Gd;
const Pango = imports.gi.Pango;

const TrackerModel = imports.trackerModel;
const View = imports.view;
const Lang = imports.lang;

const _VIEW_ITEM_WIDTH = 152;
const _VIEW_ITEM_WRAP_WIDTH = 140;
const _VIEW_COLUMN_SPACING = 20;
const _VIEW_COLUMNS = 4;
const _VIEW_MARGIN = 16;

function IconView(window) {
    this._init(window);
}

IconView.prototype = {
    __proto__: View.View.prototype,

    _init: function(window) {
        View.View.prototype._init.call(this, window);

        this.view = new Gtk.IconView({ hexpand: true,
                                       vexpand: true });

        this.view.item_width = _VIEW_ITEM_WIDTH;
        this.view.column_spacing = _VIEW_COLUMN_SPACING;
        this.view.columns = _VIEW_COLUMNS;
        this.view.margin = _VIEW_MARGIN;
        this.view.set_selection_mode(Gtk.SelectionMode.MULTIPLE);

        this.view.connect('item-activated', 
                          Lang.bind(this, this._onItemActivated));
        this.view.connect('selection-changed', 
                          Lang.bind(this, this._onSelectionChanged));

        this.view.show();
    },

    createRenderers: function() {
        let pixbufRenderer =
            new Gd.FramedPixbufRenderer({ xalign: 0.5,
                                          yalign: 0.5 });

        this.view.pack_start(pixbufRenderer, false);
        this.view.add_attribute(pixbufRenderer,
                                'pixbuf', TrackerModel.ModelColumns.ICON);

        let textRenderer =
            new Gd.TwoLinesRenderer({ alignment: Pango.Alignment.CENTER,
                                      wrap_mode: Pango.WrapMode.WORD_CHAR,
                                      wrap_width: _VIEW_ITEM_WRAP_WIDTH,
                                      xalign: 0.5,
                                      yalign: 0.0,
                                      text_lines: 3 });
        this.view.pack_start(textRenderer, false);
        this.view.add_attribute(textRenderer,
                                'text', TrackerModel.ModelColumns.TITLE);
        this.view.add_attribute(textRenderer,
                                'line-two', TrackerModel.ModelColumns.AUTHOR);
    },

    _onSelectionChanged: function(view) {
        let selection = this.view.get_selected_items();
        this.window.showOrHideTagToolbar(selection);
    },

    _onItemActivated: function(view, path, column) {
        this.activateItem(path);
    },
}